#!/usr/bin/env bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ox-alpha.sh <prompt>" >&2
  exit 1
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Error: OPENROUTER_API_KEY environment variable is not set." >&2
  exit 1
fi

prompt="$*"

payload=$(jq -n --arg prompt "$prompt" '{
  model: "stealth/ox-alpha",
  messages: [{role: "user", content: $prompt}],
  reasoning: {enabled: true}
}')

response=$(curl -sS https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d "$payload")

if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
  echo "Error from OpenRouter API:" >&2
  echo "$response" | jq -r '.error' >&2
  exit 1
fi

echo "$response" | jq -r '.choices[0].message.content'
