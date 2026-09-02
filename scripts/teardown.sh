#!/usr/bin/env bash
# Remove everything this demo created. Empties the S3 buckets first (CloudFormation
# cannot delete non-empty buckets) then deletes the stack.
#   AWS_REGION  (default: ap-south-1)
#   STACK_NAME  (default: rekognition-liveness-dev)
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${STACK_NAME:-rekognition-liveness-dev}"

OUTPUTS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --region "$REGION" --query 'Stacks[0].Outputs' --output json 2>/dev/null || echo "[]")
get() {
  echo "$OUTPUTS" | python3 -c \
    "import sys,json;print(next((o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='$1'),''))"
}

for KEY in FrontendBucketNameOut FacesBucketName; do
  B=$(get "$KEY")
  if [ -n "$B" ]; then
    echo "-> Emptying s3://$B ..."
    aws s3 rm "s3://$B" --recursive --region "$REGION" --only-show-errors || true
  fi
done

echo "-> Deleting stack $STACK_NAME ..."
sam delete --stack-name "$STACK_NAME" --region "$REGION" --no-prompts

echo "Teardown complete."
