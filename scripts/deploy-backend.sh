#!/usr/bin/env bash
# Deploy the rekognition-liveness backend (Lambda + Rekognition collection +
# DynamoDB + S3 + CloudFront + guest Identity Pool) to the CURRENT AWS account.
#
# Uses whatever AWS credentials are active (no account is hardcoded). Override
# region/stack/model via env vars:
#   AWS_REGION       (default: ap-south-1)   — must be a region where both
#                                              Rekognition Face Liveness AND the
#                                              gesture model are available.
#   STACK_NAME       (default: rekognition-liveness-dev)
#   ENVIRONMENT      (default: dev)
#   GESTURE_MODEL_ID (default: in.openai.gpt-5.6-luna) — bare Bedrock
#                                              inference-profile id; resolves in
#                                              the deploying account.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${STACK_NAME:-rekognition-liveness-dev}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
GESTURE_MODEL_ID="${GESTURE_MODEL_ID:-in.openai.gpt-5.6-luna}"
# Applies to every aws/sam command below. Override with AWS_PROFILE=... if needed.
export AWS_PROFILE="${AWS_PROFILE:-sso2}"

cd "$(dirname "$0")/../infrastructure"

echo "=================================================="
echo " rekognition-liveness backend deploy"
echo "  Profile:   $AWS_PROFILE"
echo "  Account:   $(aws sts get-caller-identity --query Account --output text)"
echo "  Region:    $REGION"
echo "  Stack:     $STACK_NAME"
echo "  Model:     $GESTURE_MODEL_ID"
echo "=================================================="

# The only Python dep is boto3, already present in the Lambda runtime. A plain
# `sam build` needs python3.13 on PATH; if that's missing, fall back to a
# container build (requires Docker/Finch).
if ! sam build 2>/dev/null; then
  echo "-> python3.13 not on PATH; building inside a container (needs Docker)..."
  sam build --use-container
fi

sam deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "Environment=$ENVIRONMENT GestureModelId=$GESTURE_MODEL_ID"

echo "Backend deployed. Next: ./scripts/deploy-frontend.sh"
