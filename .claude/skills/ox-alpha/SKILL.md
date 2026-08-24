---
name: ox-alpha
description: Consult the stealth/ox-alpha model on OpenRouter for a second opinion, an independent check, or a reasoning-heavy question during any coding session. Use when the user says "ask ox-alpha", "check with ox-alpha", or wants a second opinion from this specific model.
---

# Ox Alpha

Queries the `stealth/ox-alpha` model on OpenRouter's chat completions API, with
reasoning enabled, and prints its response.

## Usage

```
bash ~/.claude/skills/ox-alpha/scripts/ox-alpha.sh "<prompt>"
```

The prompt is passed as a single string (all arguments are joined), so it
does not need to be quoted specially beyond normal shell quoting.

## Requirements

- `OPENROUTER_API_KEY` environment variable must be set (get one at
  https://openrouter.ai/keys).
- `curl` and `jq` must be installed.

## Output

Prints the model's response text to stdout. On API error, prints the error
to stderr and exits non-zero.
