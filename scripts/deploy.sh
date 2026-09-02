#!/usr/bin/env bash
# One-shot deploy: backend stack, then frontend to S3/CloudFront.
# Honors AWS_REGION / STACK_NAME / ENVIRONMENT / GESTURE_MODEL_ID env overrides.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/deploy-backend.sh"
"$HERE/deploy-frontend.sh"
