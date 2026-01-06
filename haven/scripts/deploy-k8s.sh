#!/bin/bash
set -e

# Haven Kubernetes Deployment Script
# This script deploys Haven to Kubernetes

echo "🚀 Haven Kubernetes Deployment"
echo "=============================="

# Configuration
NAMESPACE="${NAMESPACE:-haven}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-kubectl}" # kubectl or helm

# Check kubectl
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found. Please install kubectl."
  exit 1
fi

# Check cluster connection
echo "📋 Checking cluster connection..."
if ! kubectl cluster-info &> /dev/null; then
  echo "❌ Cannot connect to Kubernetes cluster"
  echo "Please configure kubectl to connect to your cluster"
  exit 1
fi

echo "✅ Connected to cluster: $(kubectl config current-context)"

# Create namespace
echo ""
echo "📦 Creating namespace: $NAMESPACE"
kubectl apply -f k8s/namespace.yaml

# Check for secrets
echo ""
echo "🔐 Checking secrets..."
if ! kubectl get secret haven-secrets -n "$NAMESPACE" &> /dev/null; then
  echo "⚠️  Secret 'haven-secrets' not found"
  echo ""
  echo "Please create the secret with:"
  echo "  kubectl create secret generic haven-secrets \\"
  echo "    --from-literal=NEXT_PUBLIC_SUPABASE_URL=... \\"
  echo "    --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY=... \\"
  echo "    --from-literal=SUPABASE_SERVICE_ROLE_KEY=... \\"
  echo "    --from-literal=OPENAI_API_KEY=... \\"
  echo "    --from-literal=STRIPE_SECRET_KEY=... \\"
  echo "    --from-literal=STRIPE_WEBHOOK_SECRET=... \\"
  echo "    --from-literal=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... \\"
  echo "    --from-literal=JWT_SECRET=... \\"
  echo "    --namespace=$NAMESPACE"
  exit 1
fi

echo "✅ Secrets found"

# Deploy based on type
if [ "$DEPLOYMENT_TYPE" = "helm" ]; then
  # Helm deployment
  if ! command -v helm &> /dev/null; then
    echo "❌ Helm not found. Please install Helm or use DEPLOYMENT_TYPE=kubectl"
    exit 1
  fi

  echo ""
  echo "🎯 Deploying with Helm..."
  helm upgrade --install haven ./helm/haven \
    --namespace "$NAMESPACE" \
    --set image.tag="$IMAGE_TAG" \
    --wait \
    --timeout 5m
else
  # kubectl deployment
  echo ""
  echo "🎯 Deploying with kubectl..."

  # Deploy resources in order
  echo "  - Service Account"
  kubectl apply -f k8s/service-account.yaml

  echo "  - Redis"
  kubectl apply -f k8s/redis.yaml

  echo "  - Application Deployment"
  kubectl apply -f k8s/deployment.yaml

  echo "  - Service"
  kubectl apply -f k8s/service.yaml

  echo "  - Ingress"
  kubectl apply -f k8s/ingress.yaml

  echo "  - Network Policies"
  kubectl apply -f k8s/network-policy.yaml

  echo "  - Pod Disruption Budget"
  kubectl apply -f k8s/pod-disruption-budget.yaml
fi

# Wait for deployment
echo ""
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available deployment/haven-app \
  -n "$NAMESPACE" \
  --timeout=300s

# Check pod status
echo ""
echo "📊 Pod Status:"
kubectl get pods -n "$NAMESPACE" -l app=haven

# Check service
echo ""
echo "🌐 Services:"
kubectl get svc -n "$NAMESPACE"

# Check ingress
echo ""
echo "🔗 Ingress:"
kubectl get ingress -n "$NAMESPACE"

# Health check
echo ""
echo "🏥 Health Check:"
POD=$(kubectl get pods -n "$NAMESPACE" -l app=haven -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NAMESPACE" "$POD" -- wget -qO- http://localhost:3000/api/health || echo "Health check failed"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Useful commands:"
echo "  View logs:      kubectl logs -f deployment/haven-app -n $NAMESPACE"
echo "  Get pods:       kubectl get pods -n $NAMESPACE"
echo "  Describe pod:   kubectl describe pod <pod-name> -n $NAMESPACE"
echo "  Port forward:   kubectl port-forward svc/haven-service 3000:80 -n $NAMESPACE"
echo "  Scale:          kubectl scale deployment haven-app --replicas=5 -n $NAMESPACE"
echo "  Rollback:       kubectl rollout undo deployment/haven-app -n $NAMESPACE"
