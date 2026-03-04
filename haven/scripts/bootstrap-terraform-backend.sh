#!/usr/bin/env bash
# Bootstrap the Terraform S3 backend prerequisites.
# Run this ONCE before the first `terraform init` in a new AWS account.
#
# Usage:
#   AWS_PROFILE=haven-prod bash scripts/bootstrap-terraform-backend.sh
#
# Requirements: AWS CLI configured with permissions to create S3 buckets and
# DynamoDB tables.

set -euo pipefail

BUCKET="haven-terraform-state"
TABLE="haven-terraform-locks"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "==> Creating Terraform state bucket: s3://${BUCKET}"
if aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" 2>/dev/null; then
  echo "    Bucket already exists — skipping creation."
else
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    $([ "${REGION}" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=${REGION}" || true)
  echo "    Bucket created."
fi

echo "==> Enabling versioning on bucket"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

echo "==> Enabling KMS encryption on bucket"
aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'

echo "==> Blocking all public access on bucket"
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "==> Creating DynamoDB lock table: ${TABLE}"
if aws dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" 2>/dev/null; then
  echo "    Table already exists — skipping creation."
else
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"
  aws dynamodb wait table-exists --table-name "${TABLE}" --region "${REGION}"
  echo "    Table created."
fi

echo ""
echo "Bootstrap complete. You can now run: terraform init"
