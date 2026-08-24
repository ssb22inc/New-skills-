#!/usr/bin/env bash
# Query the stealth/ox-alpha model on OpenRouter and print its reply.
#
# Usage:
#   ox-alpha.sh "your prompt" [--no-reasoning]
#
# Requires:
#   - OPENROUTER_API_KEY environment variable (never hardcode the key here)
#   - curl, jq
set -euo pipefail

PROMPT="${1:-}"
SHOW_REASONING=true
if [ "${2:-}" = "--no-reasoning" ]; then
  SHOW_REASONING=false
fi

if [ -z "$PROMPT" ]; then
  echo "Usage: $(basename "$0") \"your prompt\" [--no-reasoning]" >&2
  exit 1
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Error: OPENROUTER_API_KEY is not set." >&2
  echo "Set it in your shell (export OPENROUTER_API_KEY=...) or .env — never commit it." >&2
  exit 1
fi

REQUEST_BODY=$(jq -n \
  --arg prompt "$PROMPT" \
  --argjson reasoning_enabled "$SHOW_REASONING" \
  '{
    model: "stealth/ox-alpha",
    messages: [{role: "user", content: $prompt}],
    reasoning: {enabled: $reasoning_enabled}
  }')

HTTP_STATUS=$(curl -sS -o /tmp/ox-alpha-response.json -w "%{http_code}" \
  https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d "$REQUEST_BODY")

RESPONSE=$(cat /tmp/ox-alpha-response.json)
rm -f /tmp/ox-alpha-response.json

if [ "$HTTP_STATUS" != "200" ]; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message // "unknown error"')
  echo "OpenRouter request failed (HTTP $HTTP_STATUS): $ERROR_MSG" >&2
  exit 1
fi

REASONING_TEXT=$(echo "$RESPONSE" | jq -r '.choices[0].message.reasoning // empty')
CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')

if [ -z "$CONTENT" ]; then
  echo "No content in response. Raw response:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

if [ "$SHOW_REASONING" = true ] && [ -n "$REASONING_TEXT" ]; then
  echo "## Reasoning"
  echo "$REASONING_TEXT"
  echo
  echo "## Answer"
fi

echo "$CONTENT"
