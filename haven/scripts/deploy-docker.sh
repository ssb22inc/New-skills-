#!/bin/bash
set -e

# Haven Docker Deployment Script
# This script builds and deploys Haven using Docker Compose

echo "🚀 Haven Docker Deployment"
echo "=========================="

# Check required environment variables
REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "OPENAI_API_KEY"
  "STRIPE_SECRET_KEY"
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
)

echo "📋 Checking environment variables..."
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo "❌ Missing required environment variables:"
  printf '   - %s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "Please set these variables in .env.production or export them."
  exit 1
fi

echo "✅ All required environment variables are set"

# Build Docker image
echo ""
echo "🔨 Building Docker image..."
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" \
  --build-arg NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://haven.app}" \
  -t haven/app:latest \
  -t haven/app:$(date +%Y%m%d-%H%M%S) \
  .

echo "✅ Docker image built successfully"

# Start services
echo ""
echo "🚀 Starting services with Docker Compose..."
docker-compose down
docker-compose up -d

# Wait for health check
echo ""
echo "⏳ Waiting for application to be healthy..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Application is healthy!"
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ Health check failed after $MAX_ATTEMPTS attempts"
    echo "Showing logs:"
    docker-compose logs app
    exit 1
  fi

  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS - waiting..."
  sleep 2
done

# Show status
echo ""
echo "📊 Deployment Status:"
docker-compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Access the application at: http://localhost:3000"
echo "View logs: docker-compose logs -f app"
echo "Stop services: docker-compose down"
