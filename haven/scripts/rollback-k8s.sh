#!/bin/bash
set -e

# Haven Kubernetes Rollback Script
# Rollback to previous deployment version

echo "⏪ Haven Kubernetes Rollback"
echo "============================"

# Configuration
NAMESPACE="${NAMESPACE:-haven}"
DEPLOYMENT="${DEPLOYMENT:-haven-app}"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found"
  exit 1
fi

# Show rollout history
echo "📜 Rollout History:"
kubectl rollout history deployment/"$DEPLOYMENT" -n "$NAMESPACE"

# Confirm rollback
echo ""
read -p "Do you want to rollback to the previous version? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Rollback cancelled"
  exit 0
fi

# Perform rollback
echo ""
echo "⏪ Rolling back deployment..."
kubectl rollout undo deployment/"$DEPLOYMENT" -n "$NAMESPACE"

# Wait for rollback
echo ""
echo "⏳ Waiting for rollback to complete..."
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE"

# Check pod status
echo ""
echo "📊 Pod Status:"
kubectl get pods -n "$NAMESPACE" -l app=haven

# Health check
echo ""
echo "🏥 Health Check:"
POD=$(kubectl get pods -n "$NAMESPACE" -l app=haven -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NAMESPACE" "$POD" -- wget -qO- http://localhost:3000/api/health

echo ""
echo "✅ Rollback complete!"
