#!/bin/bash
set -e

ENVIRONMENT=${1:-staging}
REVISION=${2:-1}

if [ "$ENVIRONMENT" == "production" ]; then
    CLUSTER_NAME="haven-production"
    NAMESPACE="haven"
else
    CLUSTER_NAME="haven-staging"
    NAMESPACE="haven-staging"
fi

echo "🔄 Rolling back Haven in $ENVIRONMENT to revision $REVISION..."

aws eks update-kubeconfig --name $CLUSTER_NAME --region us-east-1

helm rollback haven $REVISION -n $NAMESPACE --wait

echo "✅ Rollback complete!"

# Verify
kubectl rollout status deployment/haven-app -n $NAMESPACE --timeout=5m
