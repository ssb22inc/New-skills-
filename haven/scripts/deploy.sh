#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-staging}
IMAGE_TAG=${2:-latest}

echo -e "${YELLOW}🚀 Deploying Haven to ${ENVIRONMENT}...${NC}"

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

# Set cluster name
if [ "$ENVIRONMENT" == "production" ]; then
    CLUSTER_NAME="haven-production"
    NAMESPACE="haven"
else
    CLUSTER_NAME="haven-staging"
    NAMESPACE="haven-staging"
fi

# Update kubeconfig
echo -e "${YELLOW}Configuring kubectl...${NC}"
aws eks update-kubeconfig --name $CLUSTER_NAME --region us-east-1

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# Check if namespace exists
if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo -e "${YELLOW}Creating namespace $NAMESPACE...${NC}"
    kubectl create namespace $NAMESPACE
fi

# Check image exists
echo -e "${YELLOW}Verifying image exists...${NC}"
aws ecr describe-images --repository-name haven/app --image-ids imageTag=$IMAGE_TAG &> /dev/null || {
    echo -e "${RED}Image tag $IMAGE_TAG not found in ECR${NC}"
    exit 1
}

# Deploy with Helm
echo -e "${YELLOW}Deploying with Helm...${NC}"
helm upgrade --install haven ./helm/haven \
    --namespace $NAMESPACE \
    --set image.tag=$IMAGE_TAG \
    --values ./helm/haven/values-${ENVIRONMENT}.yaml \
    --wait \
    --timeout 10m

# Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"
kubectl rollout status deployment/haven-app -n $NAMESPACE --timeout=5m

# Run smoke tests
echo -e "${YELLOW}Running smoke tests...${NC}"
if [ "$ENVIRONMENT" == "production" ]; then
    URL="https://haven.app"
else
    URL="https://staging.haven.app"
fi

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" $URL/api/health)
if [ "$HEALTH_CHECK" == "200" ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed (HTTP $HEALTH_CHECK)${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Deployment to ${ENVIRONMENT} complete!${NC}"
