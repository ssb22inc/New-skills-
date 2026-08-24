---
name: ox-alpha
description: Query the stealth/ox-alpha model on OpenRouter for a second opinion, an alternate reasoning trace, or a cross-check on a coding question or approach, from inside any Claude Code session. Trigger this whenever the user says "ask ox-alpha", "check with ox-alpha", "/ox-alpha", "get a second opinion", "cross-check this with another model", or otherwise wants to compare an answer, plan, or piece of code against the OpenRouter stealth/ox-alpha model. Requires the OPENROUTER_API_KEY environment variable to already be set — never invent, hardcode, or ask the user to paste the key into chat.
---

# Ox Alpha

Calls the `stealth/ox-alpha` model on OpenRouter and returns its reply. Useful as
a quick second opinion — e.g. sanity-checking a tricky piece of logic, a plan, or
comparing how a different model reasons about the same problem — without leaving
the current coding session.

## Running it

Use the bundled script rather than reimplementing the curl call: it builds the
JSON body with `jq` (so prompts with quotes/newlines/unicode are never a problem),
checks the HTTP status, and surfaces the API's own error message on failure.

```bash
bash .claude/skills/ox-alpha/scripts/ox-alpha.sh "<the prompt to send>"
```

Pass `--no-reasoning` as a second argument to skip the model's reasoning trace and
print only the final answer:

```bash
bash .claude/skills/ox-alpha/scripts/ox-alpha.sh "<the prompt>" --no-reasoning
```

By default the model's `reasoning` block (if it returns one) is printed under a
`## Reasoning` heading, followed by the final answer under `## Answer`. Relay
this output back to the user — don't just summarize it away, since the reasoning
trace is often the point of asking.

## Before running

The script needs `OPENROUTER_API_KEY` set as an environment variable in the
current shell. If it's not set, the script exits with a clear error rather than
failing silently — just surface that error to the user. Do not:
- hardcode a key anywhere in this skill, the script, or any file you write
- ask the user to paste their key into the chat (it's better set via their shell
  profile, a gitignored `.env` file, or a CI/secrets manager)

If the user wants help setting the key, point them to whichever of those fits
their setup rather than requesting the raw value.

## Using outside Claude Code

The script is a standalone shell script with no Claude-specific dependencies
(just `curl`, `jq`, and `OPENROUTER_API_KEY`), so it also works run directly from
any terminal — this skill is just a thin wrapper that tells Claude when and how
to invoke it during a coding session.

To make it available in every Claude Code session regardless of repo, copy the
whole skill directory to the user-level skills folder:

```bash
mkdir -p ~/.claude/skills
cp -r .claude/skills/ox-alpha ~/.claude/skills/
```
