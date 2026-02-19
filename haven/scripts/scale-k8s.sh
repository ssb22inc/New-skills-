#!/bin/bash
set -e

# Haven Kubernetes Scaling Script
# Scale deployment to specified number of replicas

echo "📈 Haven Kubernetes Scaling"
echo "=========================="

# Configuration
NAMESPACE="${NAMESPACE:-haven}"
DEPLOYMENT="${DEPLOYMENT:-haven-app}"
REPLICAS="${1:-3}"

# Validate replicas
if ! [[ "$REPLICAS" =~ ^[0-9]+$ ]]; then
  echo "❌ Invalid replica count: $REPLICAS"
  echo "Usage: $0 <replica-count>"
  exit 1
fi

# Check kubectl
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found"
  exit 1
fi

# Get current replicas
CURRENT=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

echo "Current replicas: $CURRENT"
echo "Target replicas:  $REPLICAS"
echo ""

if [ "$CURRENT" -eq "$REPLICAS" ]; then
  echo "✅ Already at target replica count"
  exit 0
fi

# Confirm scaling
if [ "$REPLICAS" -lt "$CURRENT" ]; then
  read -p "⚠️  Scaling down from $CURRENT to $REPLICAS. Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Scaling cancelled"
    exit 0
  fi
fi

# Scale deployment
echo "📈 Scaling deployment to $REPLICAS replicas..."
kubectl scale deployment "$DEPLOYMENT" --replicas="$REPLICAS" -n "$NAMESPACE"

# Wait for scaling
echo ""
echo "⏳ Waiting for scaling to complete..."
kubectl wait --for=condition=available deployment/"$DEPLOYMENT" \
  -n "$NAMESPACE" \
  --timeout=300s

# Show pod status
echo ""
echo "📊 Pod Status:"
kubectl get pods -n "$NAMESPACE" -l app=haven

echo ""
echo "✅ Scaling complete!"
