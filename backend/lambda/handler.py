"""Lambda dispatcher for the rekognition-liveness demo.

Identity verification with Amazon Rekognition — a generic demo for any
customer / use case. Four capabilities:

  Face Liveness  — confirm a real, present person (not a photo/video/deepfake)
                   and (optionally) match against an ID document.
  Movement       — challenge-based liveness (nose-to-target + head rotation)
                   validated server-side with DetectFaces.
  Search         — identify a person against a Rekognition face collection.
  Enroll         — register / list / delete faces in the collection.

Auth & transport: this Lambda is invoked DIRECTLY from the browser via SigV4
(no API Gateway). Credentials come from the WWSO portal's Cognito Identity
Pool — the portal's Lambda@Edge already authenticated the user. The frontend
`lambdaService.invoke({action, ...})` posts a raw JSON payload; we dispatch on
`event["action"]` and ALWAYS return a raw JSON body (errors as
`{"error": "...", "code": N}`). Pattern mirrors
`demos/bedrock-apis/backend/lambda/handler.py`.

Disclaimer: strictly for testing and analysis. NOT for production workloads.
"""
from __future__ import annotations

import base64
import json
import os
import random
import time
import uuid

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
COLLECTION_ID = os.environ.get("COLLECTION_ID", "rekognition-liveness-faces")
LIVENESS_THRESHOLD = float(os.environ.get("LIVENESS_THRESHOLD", "75"))
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "90"))
CHALLENGES_TABLE = os.environ.get("CHALLENGES_TABLE", "")
FACES_BUCKET = os.environ.get("FACES_BUCKET", "")
# Multimodal model that validates gesture-liveness challenges from a single frame.
GESTURE_MODEL_ID = os.environ.get("GESTURE_MODEL_ID", "us.amazon.nova-lite-v1:0")

# Movement challenge (based on aws-samples/liveness-detection).
# Validates 4 conditions: 1 face, face centered + distance, nose on target, rotation.
MOVEMENT_TARGET_HALF = 0.05  # half-side of the NOSE target square (normalized)
MOVEMENT_ROTATION_MIN = 5.0  # degrees of yaw/pitch proving head rotation
# FACE AREA square (centered) — where the face must sit. Aligned with the
# centering tolerances below (guide == acceptance region).
FACE_AREA_HALF_W = 0.20
FACE_AREA_HALF_H = 0.26
# Centering tolerances and face-size (distance) range — lenient.
FACE_CENTER_TOL_X = 0.20
FACE_CENTER_TOL_Y = 0.22
FACE_MIN_W = 0.16
FACE_MAX_W = 0.80

rekognition = boto3.client("rekognition", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)


def _data_url_mime(value, default="image/jpeg"):
    if isinstance(value, str) and value.startswith("data:") and ";" in value:
        return value[5 : value.index(";")] or default
    return default


def _err(message, code=400):
    """Error envelope expected by the frontend lambdaService."""
    return {"error": str(message), "code": code}


def _decode_image(value):
    """Accepts raw base64 or a data URL (data:image/...;base64,....)."""
    if not value:
        raise ValueError("image missing")
    if "," in value and value.strip().startswith("data:"):
        value = value.split(",", 1)[1]
    return base64.b64decode(value)


# --------------------------------------------------------------------------- #
# Handlers — each returns a raw JSON-serializable body.
# --------------------------------------------------------------------------- #
def liveness_create(_body):
    resp = rekognition.create_face_liveness_session(Settings={"AuditImagesLimit": 2})
    return {"sessionId": resp["SessionId"]}


def liveness_results(body):
    session_id = body.get("sessionId")
    if not session_id:
        return _err("sessionId required")
    resp = rekognition.get_face_liveness_session_results(SessionId=session_id)
    status = resp["Status"]
    confidence = resp.get("Confidence", 0)
    is_live = status == "SUCCEEDED" and confidence >= LIVENESS_THRESHOLD
    ref = resp.get("ReferenceImage") or {}
    ref_b64 = None
    if ref.get("Bytes"):
        ref_b64 = base64.b64encode(ref["Bytes"]).decode()
    return {
        "status": status,
        "confidence": round(confidence, 2),
        "isLive": is_live,
        "threshold": LIVENESS_THRESHOLD,
        "referenceImage": ref_b64,
    }


def _liveness_reference_bytes(session_id):
    resp = rekognition.get_face_liveness_session_results(SessionId=session_id)
    if resp["Status"] != "SUCCEEDED":
        return None, resp["Status"], resp.get("Confidence", 0), None
    confidence = resp.get("Confidence", 0)
    ref = resp.get("ReferenceImage") or {}
    return ref.get("Bytes"), resp["Status"], confidence, ref


def verify(body):
    """Full flow: validate liveness, identify against the collection and
    (optionally) compare the live face with an ID document."""
    session_id = body.get("sessionId")
    if not session_id:
        return _err("sessionId required")

    ref_bytes, status, confidence, _ = _liveness_reference_bytes(session_id)
    is_live = status == "SUCCEEDED" and confidence >= LIVENESS_THRESHOLD
    result = {
        "liveness": {
            "status": status,
            "confidence": round(confidence, 2),
            "isLive": is_live,
            "threshold": LIVENESS_THRESHOLD,
        }
    }
    if not is_live or not ref_bytes:
        result["message"] = "Liveness not confirmed — flow interrupted."
        return result

    # 1) Identify the person in the collection
    try:
        search = rekognition.search_faces_by_image(
            CollectionId=COLLECTION_ID,
            Image={"Bytes": ref_bytes},
            FaceMatchThreshold=SIMILARITY_THRESHOLD,
            MaxFaces=3,
        )
        matches = search.get("FaceMatches", [])
        if matches:
            best = matches[0]
            result["identity"] = {
                "matched": True,
                "name": best["Face"].get("ExternalImageId"),
                "similarity": round(best["Similarity"], 2),
            }
        else:
            result["identity"] = {"matched": False}
    except rekognition.exceptions.InvalidParameterException:
        result["identity"] = {"matched": False, "error": "no face in reference"}
    except rekognition.exceptions.ResourceNotFoundException:
        result["identity"] = {"matched": False, "error": "collection empty"}

    # 2) Optional: compare with an ID document
    document = body.get("documentImage")
    if document:
        try:
            doc_bytes = _decode_image(document)
            cmp = rekognition.compare_faces(
                SourceImage={"Bytes": ref_bytes},
                TargetImage={"Bytes": doc_bytes},
                SimilarityThreshold=SIMILARITY_THRESHOLD,
            )
            doc_matches = cmp.get("FaceMatches", [])
            result["document"] = {
                "matched": bool(doc_matches),
                "similarity": round(doc_matches[0]["Similarity"], 2) if doc_matches else 0,
            }
        except Exception as e:  # noqa: BLE001
            result["document"] = {"matched": False, "error": str(e)}

    return result


def faces_index(body):
    name = (body.get("name") or "").strip()
    if not name:
        return _err("name required")
    raw = body.get("image")
    try:
        image_bytes = _decode_image(raw)
    except Exception as e:  # noqa: BLE001
        return _err(f"invalid image: {e}")

    resp = rekognition.index_faces(
        CollectionId=COLLECTION_ID,
        Image={"Bytes": image_bytes},
        ExternalImageId=name.replace(" ", "_"),
        MaxFaces=1,
        QualityFilter="AUTO",
    )
    records = resp.get("FaceRecords", [])
    if not records:
        return {"indexed": False, "message": "No face detected"}

    face_id = records[0]["Face"]["FaceId"]

    # Store the original photo in S3 to show later in the list (the Rekognition
    # collection only stores the face vector, not the image).
    if FACES_BUCKET:
        try:
            s3.put_object(
                Bucket=FACES_BUCKET,
                Key=f"{face_id}.jpg",
                Body=image_bytes,
                ContentType=_data_url_mime(raw),
                Metadata={"name": name},
            )
        except Exception as e:  # noqa: BLE001
            print(f"Failed to save image to S3: {e}")

    return {"indexed": True, "name": name, "faceId": face_id}


def _estimate_age(image_bytes):
    """Estimated age range (years) of the largest face via DetectFaces.
    Rekognition returns a range (Low/High), not an exact age. Returns None
    when no face is found."""
    try:
        resp = rekognition.detect_faces(Image={"Bytes": image_bytes}, Attributes=["AGE_RANGE"])
        faces = resp.get("FaceDetails", [])
        if not faces:
            return None
        faces.sort(
            key=lambda f: f.get("BoundingBox", {}).get("Width", 0) * f.get("BoundingBox", {}).get("Height", 0),
            reverse=True,
        )
        ar = faces[0].get("AgeRange") or {}
        if ar.get("Low") is None:
            return None
        return {"low": ar.get("Low"), "high": ar.get("High")}
    except Exception as e:  # noqa: BLE001
        print(f"age estimation failed: {e}")
        return None


def faces_search(body):
    try:
        image_bytes = _decode_image(body.get("image"))
    except Exception as e:  # noqa: BLE001
        return _err(f"invalid image: {e}")
    threshold = float(body.get("threshold", 80))
    age_range = _estimate_age(image_bytes)
    try:
        resp = rekognition.search_faces_by_image(
            CollectionId=COLLECTION_ID,
            Image={"Bytes": image_bytes},
            FaceMatchThreshold=threshold,
            MaxFaces=5,
        )
    except rekognition.exceptions.InvalidParameterException:
        return {"matched": False, "message": "No face in the image", "ageRange": age_range}
    except rekognition.exceptions.ResourceNotFoundException:
        return {"matched": False, "message": "Collection empty", "ageRange": age_range}

    matches = [
        {
            "name": (m["Face"].get("ExternalImageId") or "").replace("_", " "),
            "similarity": round(m["Similarity"], 2),
            "faceId": m["Face"]["FaceId"],
        }
        for m in resp.get("FaceMatches", [])
    ]
    return {"matched": bool(matches), "matches": matches, "ageRange": age_range}


def faces_compare(body):
    try:
        source = _decode_image(body.get("source"))
        target = _decode_image(body.get("target"))
    except Exception as e:  # noqa: BLE001
        return _err(f"invalid image: {e}")
    threshold = float(body.get("threshold", SIMILARITY_THRESHOLD))
    resp = rekognition.compare_faces(
        SourceImage={"Bytes": source},
        TargetImage={"Bytes": target},
        SimilarityThreshold=threshold,
    )
    matches = resp.get("FaceMatches", [])
    return {
        "matched": bool(matches),
        "similarity": round(matches[0]["Similarity"], 2) if matches else 0,
    }


# --------------------------------------------------------------------------- #
# Movement liveness (based on aws-samples/liveness-detection)
# Flow: create challenge (random target) -> user moves the nose to the target
# -> backend validates with DetectFaces (1 face + nose on target + head rotation).
# --------------------------------------------------------------------------- #
# Nose target positions — moderate offset from center, reachable by rotating
# the head while the face stays centered (normalized coordinates).
MOVEMENT_TARGETS = {
    "left": (0.38, 0.50),
    "right": (0.62, 0.50),
    "up": (0.50, 0.38),
    "down": (0.50, 0.62),
}


def movement_challenge(_body):
    if not CHALLENGES_TABLE:
        return _err("challenges table not configured", 500)
    direction = random.choice(list(MOVEMENT_TARGETS.keys()))
    tx, ty = MOVEMENT_TARGETS[direction]
    challenge_id = str(uuid.uuid4())
    dynamodb.Table(CHALLENGES_TABLE).put_item(
        Item={
            "challengeId": challenge_id,
            "tx": str(tx),
            "ty": str(ty),
            "half": str(MOVEMENT_TARGET_HALF),
            "direction": direction,
            "ttl": int(time.time()) + 600,
        }
    )
    return {
        "challengeId": challenge_id,
        "direction": direction,
        "target": {"x": tx, "y": ty, "half": MOVEMENT_TARGET_HALF},
        "faceArea": {"x": 0.5, "y": 0.5, "halfW": FACE_AREA_HALF_W, "halfH": FACE_AREA_HALF_H},
    }


def movement_verify(body):
    challenge_id = body.get("challengeId")
    if not challenge_id:
        return _err("challengeId required")
    if not CHALLENGES_TABLE:
        return _err("challenges table not configured", 500)

    table = dynamodb.Table(CHALLENGES_TABLE)
    item = table.get_item(Key={"challengeId": challenge_id}).get("Item")
    if not item:
        return {"isLive": False, "error": "challenge expired or invalid"}

    try:
        image_bytes = _decode_image(body.get("frame"))
    except Exception as e:  # noqa: BLE001
        return _err(f"invalid image: {e}")

    resp = rekognition.detect_faces(Image={"Bytes": image_bytes}, Attributes=["DEFAULT"])
    faces = resp.get("FaceDetails", [])

    checks = {"singleFace": False, "faceCentered": False, "noseOnTarget": False, "rotated": False}
    details = {}

    single = len(faces) == 1 and faces[0].get("Confidence", 0) >= 90
    checks["singleFace"] = single

    if single:
        face = faces[0]
        tx, ty, half = float(item["tx"]), float(item["ty"]), float(item["half"])

        # 2) Face centered + adequate distance (face square)
        box = face.get("BoundingBox", {})
        fcx = box.get("Left", 0) + box.get("Width", 0) / 2
        fcy = box.get("Top", 0) + box.get("Height", 0) / 2
        fw = box.get("Width", 0)
        checks["faceCentered"] = (
            abs(fcx - 0.5) <= FACE_CENTER_TOL_X
            and abs(fcy - 0.5) <= FACE_CENTER_TOL_Y
            and FACE_MIN_W <= fw <= FACE_MAX_W
        )
        details["face"] = {"cx": round(fcx, 3), "cy": round(fcy, 3), "w": round(fw, 3)}

        # 3) Nose reached the target (nose square)
        nose = next((l for l in face.get("Landmarks", []) if l["Type"] == "nose"), None)
        if nose:
            checks["noseOnTarget"] = abs(nose["X"] - tx) <= half and abs(nose["Y"] - ty) <= half
            details["nose"] = {"x": round(nose["X"], 3), "y": round(nose["Y"], 3)}

        # 4) Head rotation (required) — via DetectFaces pose
        pose = face.get("Pose", {})
        yaw, pitch = abs(pose.get("Yaw", 0)), abs(pose.get("Pitch", 0))
        checks["rotated"] = yaw >= MOVEMENT_ROTATION_MIN or pitch >= MOVEMENT_ROTATION_MIN
        details["pose"] = {"yaw": round(pose.get("Yaw", 0), 1), "pitch": round(pose.get("Pitch", 0), 1)}

    # single-use challenge
    try:
        table.delete_item(Key={"challengeId": challenge_id})
    except Exception:  # noqa: BLE001
        pass

    return {
        "isLive": all(checks.values()),
        "checks": checks,
        "details": details,
        "target": {"x": float(item["tx"]), "y": float(item["ty"]), "half": float(item["half"])},
    }


def faces_delete(body):
    face_id = body.get("faceId")
    if not face_id:
        return _err("faceId required")

    # Remove the face vector from the Rekognition collection
    rekognition.delete_faces(CollectionId=COLLECTION_ID, FaceIds=[face_id])

    # Remove the associated photo from S3 (if any)
    if FACES_BUCKET:
        try:
            s3.delete_object(Bucket=FACES_BUCKET, Key=f"{face_id}.jpg")
        except Exception as e:  # noqa: BLE001
            print(f"Failed to remove image from S3: {e}")

    return {"deleted": True, "faceId": face_id}


def faces_list(_body):
    try:
        resp = rekognition.list_faces(CollectionId=COLLECTION_ID, MaxResults=100)
    except rekognition.exceptions.ResourceNotFoundException:
        return {"count": 0, "faces": []}
    faces = []
    for f in resp.get("Faces", []):
        face_id = f["FaceId"]
        item = {
            "name": (f.get("ExternalImageId") or "").replace("_", " "),
            "faceId": face_id,
        }
        if FACES_BUCKET:
            try:
                item["imageUrl"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": FACES_BUCKET, "Key": f"{face_id}.jpg"},
                    ExpiresIn=3600,
                )
            except Exception:  # noqa: BLE001
                item["imageUrl"] = None
        faces.append(item)
    return {"count": len(faces), "faces": faces}


# --------------------------------------------------------------------------- #
# Gesture liveness (Bedrock multimodal). The browser picks a random challenge
# and captures a single frame; Bedrock decides whether the gesture is present.
# Descriptions live server-side (keyed by id) so the model prompt is not
# client-controlled. Only gestures verifiable from ONE still frame are listed
# (no blink — a still can't show it).
# --------------------------------------------------------------------------- #
GESTURE_PROMPTS = {
    "thumb_up": "giving a thumbs-up: one thumb clearly extended upward while the other fingers are curled into the palm",
    "victory": "making a victory / peace sign: the index and middle fingers extended forming a V, the remaining fingers folded",
    "open_palm": "showing one open palm toward the camera with all five fingers extended and spread apart",
    "fist": "making a closed fist: all fingers curled into the palm, with no fingers extended",
    "point_up": "pointing upward with a single extended index finger while the other fingers are folded",
    
    "smile": "smiling clearly, with a visible smile",
    "wink": "winking: exactly ONE eye fully closed while the OTHER eye stays clearly open (not both eyes closed, not both open)",
    "look_up": "tilting their head upward and clearly looking up, chin raised toward the ceiling",
    "look_down": "tilting their head downward and clearly looking down, chin lowered toward the chest",
    "look_left": "turning their head to look toward their OWN left side (their face rotated to their left)",
    "look_right": "turning their head to look toward their OWN right side (their face rotated to their right)",
    "both_hands_open": "showing BOTH hands open toward the camera at the same time, with all ten fingers extended",
    "both_thumbs_up": "giving a thumbs-up with BOTH hands at the same time",
    # Combined challenges — BOTH conditions must be true in the same frame.
    "smile_victory": "at the SAME TIME smiling AND making a victory / peace sign (index and middle fingers forming a V)",
    "victory_look_up": "at the SAME TIME making a victory / peace sign AND tilting their head up, looking upward",
    "open_palm_smile": "at the SAME TIME showing one open palm (five fingers) AND smiling",
    "wink_thumb": "at the SAME TIME winking (exactly one eye closed) AND giving a thumbs-up",
}


def _parse_json_object(text):
    """Best-effort extraction of the first JSON object from model output
    (handles code fences / surrounding prose)."""
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def gesture_challenges(_body):
    """Return the catalog of gesture ids the backend can verify (the frontend
    localizes the labels; ids are the wire contract)."""
    return {"gestures": list(GESTURE_PROMPTS.keys())}


def gesture_verify(body):
    gesture = body.get("gesture")
    desc = GESTURE_PROMPTS.get(gesture)
    if not desc:
        return _err(f"unknown gesture: {gesture}")
    try:
        image_bytes = _decode_image(body.get("frame"))
    except Exception as e:  # noqa: BLE001
        return _err(f"invalid image: {e}")

    prompt = (
        "You are a strict liveness-challenge verifier. Look at the person in the image and decide "
        f"whether they are clearly {desc}. Judge only what is visibly happening in this single frame. "
        'Respond with ONLY a compact JSON object, no prose: '
        '{"performed": true or false, "confidence": 0-100, "reason": "<short reason>"}. '
        "Set performed=true only when the gesture is unambiguous."
    )
    resp = bedrock_runtime.converse(
        modelId=GESTURE_MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [
                    {"text": prompt},
                    {"image": {"format": "jpeg", "source": {"bytes": image_bytes}}},
                ],
            }
        ],
        # NOTE: `temperature` is intentionally omitted. Some models (e.g. the
        # GPT-5.6 Luna profile used here) reject the temperature field via
        # Converse with a ValidationException; leaving it unset works across
        # both those models and Nova.
        inferenceConfig={"maxTokens": 300},
    )
    # Pick the first text block. Some models (e.g. GPT-5.6 Luna) prepend a
    # reasoningContent block, so content[0] is not guaranteed to hold "text".
    content_blocks = resp["output"]["message"].get("content", [])
    text = next(
        (b["text"] for b in content_blocks if isinstance(b, dict) and "text" in b),
        "",
    ).strip()
    verdict = _parse_json_object(text) or {}
    return {
        "gesture": gesture,
        "performed": bool(verdict.get("performed", False)),
        "confidence": verdict.get("confidence"),
        "reason": verdict.get("reason") or text[:200],
        "modelId": GESTURE_MODEL_ID,
    }


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
ACTIONS = {
    "liveness/create": liveness_create,
    "liveness/results": liveness_results,
    "verify": verify,
    "movement/challenge": movement_challenge,
    "movement/verify": movement_verify,
    "faces/index": faces_index,
    "faces/search": faces_search,
    "faces/compare": faces_compare,
    "faces/delete": faces_delete,
    "faces/list": faces_list,
    "gesture/challenges": gesture_challenges,
    "gesture/verify": gesture_verify,
}


def _extract_payload(event):
    """Support both direct invoke ({action, ...}) and, defensively, an API
    Gateway proxy envelope (body is a JSON string)."""
    if isinstance(event, dict) and "action" in event:
        return event
    body = event.get("body") if isinstance(event, dict) else None
    if isinstance(body, str) and body:
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}
    return event if isinstance(event, dict) else {}


def lambda_handler(event, _context):
    payload = _extract_payload(event)
    action = (payload or {}).get("action")
    fn = ACTIONS.get(action)
    if not fn:
        return _err(f"unknown action: {action}", 404)
    try:
        return fn(payload)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR in action {action}: {e}")
        return _err(str(e), 500)
