#!/bin/bash

ENVIRONMENT=${1:-production}

if [ "$ENVIRONMENT" == "production" ]; then
    URLS=("https://haven.app" "https://haven.app/api/health")
else
    URLS=("https://staging.haven.app" "https://staging.haven.app/api/health")
fi

echo "🏥 Health Check for $ENVIRONMENT"
echo "================================"

for URL in "${URLS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL")
    LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$URL")

    if [ "$STATUS" == "200" ]; then
        echo "✅ $URL - HTTP $STATUS (${LATENCY}s)"
    else
        echo "❌ $URL - HTTP $STATUS"
    fi
done
