---
name: transcrab
description: "Turn URL + 'crab' into a translated article using the local transcrab-private repo scripts."
metadata:
  {
    "openclaw": {
      "emoji": "🦀",
      "notes": [
        "This is a starter skill template shipped with the TransCrab repo.",
        "You MUST ask the user for consent before adopting/activating this behavior."
      ]
    }
  }
---

# TransCrab Skill (Starter Template)

This skill is meant for OpenClaw assistants to **reliably remember** how to run TransCrab.

## Consent (required)

Before you run anything on the user’s machine or persist new long-term behavior:

- Explain what will happen (network fetch + writing files + committing/pushing)
- Ask the user to confirm the repo path and whether it’s okay

## Behavior contract

Trigger rules:

- Do **not** run on URL alone.
- Run only when the user sends a URL and then sends the keyword: `crab`.

Working directory (default):

- `~/Projects/transcrab-private`

Command:

```bash
cd ~/Projects/transcrab-private
./scripts/run-crab.sh "<url>"
```

## Pre-flight checks (do these before running)

1) Does the repo exist?
2) Is `./scripts/run-crab.sh` present and executable?
3) Is OpenClaw gateway running?

If any check fails, ask the user what to do.

## Output

- Commit + push results to the user’s private repo
- Reply with the deployed page URL.
  - Canonical path (this template): `/a/<yyyy>/<mm>/<slug>/` (yyyy/mm derived from the article `date` in `zh.md`, UTC).

## Customization points

- Default target language
- Slug rules
- Whether to store raw source
