#!/usr/bin/env bash
# Build the SPA and publish it to the S3 bucket + CloudFront created by the
# backend stack. Reads all wiring (bucket, distribution, guest identity pool,
# Lambda name) from the stack's own CloudFormation outputs — nothing hardcoded.
#
# Run AFTER deploy-backend.sh. Same env overrides:
#   AWS_REGION  (default: ap-south-1)
#   STACK_NAME  (default: rekognition-liveness-dev)
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${STACK_NAME:-rekognition-liveness-dev}"
# Applies to every aws command below. Override with AWS_PROFILE=... if needed.
export AWS_PROFILE="${AWS_PROFILE:-sso2}"

cd "$(dirname "$0")/.."

echo "-> Reading stack outputs from $STACK_NAME ($REGION)..."
OUTPUTS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --region "$REGION" --query 'Stacks[0].Outputs' --output json)

get() {
  echo "$OUTPUTS" | python3 -c \
    "import sys,json;print(next((o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='$1'),''))"
}

BUCKET=$(get FrontendBucketNameOut)
DIST=$(get CloudFrontDistributionId)
POOL=$(get GuestIdentityPoolId)
FN=$(get LambdaFunctionName)
URL=$(get CloudFrontUrl)

if [ -z "$BUCKET" ] || [ -z "$DIST" ] || [ -z "$POOL" ] || [ -z "$FN" ]; then
  echo "ERROR: missing stack outputs. Deploy the backend first (./scripts/deploy-backend.sh)." >&2
  exit 1
fi

echo "  Bucket:        $BUCKET"
echo "  Distribution:  $DIST"
echo "  Guest pool:    $POOL"
echo "  Lambda:        $FN"

cd frontend
npm install

# Build for root-served hosting. Credentials in the browser come from the
# unauthenticated (guest) Identity Pool — no login. VITE_BASE=/ so assets
# resolve at the CloudFront root.
VITE_BASE=/ \
VITE_AWS_REGION="$REGION" \
VITE_LAMBDA_FUNCTION_NAME="$FN" \
VITE_GUEST_IDENTITY_POOL_ID="$POOL" \
  npm run build

echo "-> Syncing to s3://$BUCKET ..."
# Hashed assets: cache forever.
aws s3 sync dist/assets/ "s3://$BUCKET/assets/" --region "$REGION" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
# Everything else (models, mediapipe, icons): short cache; delete stale objects.
aws s3 sync dist/ "s3://$BUCKET/" --region "$REGION" --delete \
  --exclude "index.html" --cache-control "public, max-age=86400" --only-show-errors
# index.html: never cache, so redeploys are picked up immediately.
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --region "$REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html; charset=utf-8" --only-show-errors

echo "-> Invalidating CloudFront ($DIST)..."
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" \
  --region "$REGION" --query 'Invalidation.Id' --output text

echo ""
echo "Done. Live at: $URL"
echo "(A new CloudFront distribution can take 5-10 min to finish deploying the first time.)"
