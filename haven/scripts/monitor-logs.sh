#!/bin/bash

NAMESPACE=${1:-haven}
POD_SELECTOR=${2:-app=haven}

echo "📋 Streaming logs from $NAMESPACE..."

kubectl logs -f -l $POD_SELECTOR -n $NAMESPACE --all-containers=true --max-log-requests=10 | \
    jq -r 'select(.level == "error" or .level == "warn") | "\(.time) [\(.level)] \(.msg)"'
