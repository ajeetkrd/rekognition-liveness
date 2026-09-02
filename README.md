# Rekognition Liveness — Identity Verification Demo

Self-contained demo of Amazon Rekognition identity verification. Deploys into
your own AWS account with one command set. No portal, no login required.

Capabilities (tabs):
- **Liveness** — Amazon Rekognition Face Liveness (confirm a real, present person).
- **Movement** — challenge-based liveness (nose-to-target + head rotation), validated with `DetectFaces`.
- **Gesture** — a random gesture challenge validated by a Bedrock multimodal model.
- **Search / Enroll** — index faces into a Rekognition collection and search/identify.

> Strictly for testing and demonstration. Not for production workloads.

---

## Architecture

```
Browser (SPA on CloudFront, HTTPS)
   │  guest AWS credentials (unauthenticated Cognito Identity Pool)
   ├── SigV4 → Lambda (orchestrator: Rekognition + Bedrock + DynamoDB + S3)
   └── streaming → Amazon Rekognition Face Liveness (StartFaceLivenessSession)
```

Everything is one CloudFormation/SAM stack:
- Orchestrator **Lambda** (dispatches all actions)
- Rekognition **collection** (created by a setup custom resource)
- **DynamoDB** table (single-use movement challenges, TTL)
- **S3** buckets (enrolled face photos; the built SPA)
- **CloudFront** distribution (HTTPS — required for the camera/liveness)
- Unauthenticated **Cognito Identity Pool** + least-privilege guest role

### Security note — read before sharing a URL
The Identity Pool is **unauthenticated**: anyone with the CloudFront URL can run
the demo, which invokes Rekognition, the Bedrock model, and the Lambda in your
account (i.e. incurs cost). The guest role is scoped to only those two actions
on this one function, but there is **no rate limiting**. Treat the URL as public.
For a gated version add CloudFront Basic Auth / WAF, or wire a real login.

---

## Prerequisites

- AWS account + credentials configured (the scripts use whatever is active; nothing is hardcoded).
- **AWS CLI v2**, **AWS SAM CLI**, **Node.js 18+**, **Python 3** (for the CLI), and **jq**-free (scripts use `python3`).
- Either **Docker/Finch** (for `sam build --use-container`) or **Python 3.13** on PATH — the only Lambda dependency is `boto3`.
- **Amazon Rekognition Face Liveness** must be available in your chosen region.
- **Bedrock model access** for the gesture model in your region. The default is
  the GPT-5.6 Luna cross-region inference profile (`in.openai.gpt-5.6-luna`),
  available in **ap-south-1 / ap-south-2** (India). Enable model access in the
  Bedrock console. To use a different model/region, set `GESTURE_MODEL_ID`
  (see below) to any multimodal model/profile you have (e.g. `us.amazon.nova-lite-v1:0`).

Recommended region: **ap-south-1** (default), which supports both Face Liveness
and the GPT-5.6 Luna profile.

---

## Deploy

```bash
# from this folder (demos/rekognition-liveness)
./scripts/deploy.sh
```

That runs the backend then the frontend. Or run them separately:

```bash
./scripts/deploy-backend.sh     # SAM stack (Lambda, Rekognition, S3, CloudFront, Identity Pool)
./scripts/deploy-frontend.sh    # build SPA + sync to S3 + invalidate CloudFront
```

The frontend script prints the public **CloudFront URL** at the end. A brand-new
distribution can take 5-10 minutes to finish deploying the first time.

### Configuration (env overrides)

| Variable | Default | Purpose |
|---|---|---|
| `AWS_REGION` | `ap-south-1` | Deploy region (needs Face Liveness + the gesture model). |
| `STACK_NAME` | `rekognition-liveness-dev` | CloudFormation stack name. |
| `ENVIRONMENT` | `dev` | Suffix used in resource names. |
| `GESTURE_MODEL_ID` | `in.openai.gpt-5.6-luna` | Bedrock model / inference-profile for the gesture tab. |

Example — different region + model:

```bash
AWS_REGION=us-east-1 GESTURE_MODEL_ID=us.amazon.nova-lite-v1:0 ./scripts/deploy.sh
```

---

## Run locally (optional, no hosting)

```bash
cd frontend
npm install
VITE_AWS_REGION=ap-south-1 VITE_LAMBDA_FUNCTION_NAME=rekognition-liveness-dev npm run dev
```

Local dev bakes your CLI credentials into the dev bundle (never do this for a
hosted build). Open the printed `http://localhost:5174/...` URL.

---

## Teardown

```bash
./scripts/teardown.sh
```

Empties the S3 buckets and deletes the stack.

---

## Gesture challenges

The gesture ids are defined in four places and must stay consistent:
- Backend descriptions (authoritative): `backend/lambda/handler.py` → `GESTURE_PROMPTS`
- Offered in the UI: `frontend/src/components/GestureTab.jsx` → `GESTURES`
- Client-side hold detection: `frontend/src/gesture/challenges.js` → `CHALLENGE_CHECKS`
- Labels: `frontend/src/i18n/locales/{en,pt,es}.js` → `gesture.labels.*`
