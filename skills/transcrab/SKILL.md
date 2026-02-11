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

## Pipeline (must complete end-to-end)

`./scripts/run-crab.sh` only **fetches + writes source + writes a translation prompt**.
You must finish the job: **translate → apply → commit/push → verify deploy**.

1) Generate files + capture the JSON output (need `slug` + `promptPath`):

```bash
cd ~/Projects/transcrab-private
./scripts/run-crab.sh "<url>" --lang zh
```

2) Read `promptPath`, translate it **yourself** (do not ask the user), and save to a temp file.
   - Format: first line is `# <translated title>`, blank line, then body.
   - Do **not** wrap in code fences.

3) Apply translation (writes `content/articles/<slug>/zh.md`):

```bash
node scripts/apply-translation.mjs <slug> --lang zh --in /path/to/translated.zh.md
```

4) Commit + push to the private repo:

```bash
git add content/articles/<slug>/
git commit -m "Add article: <slug>"
git push origin HEAD
```

5) Verify deployment before replying:

```bash
curl -I -L https://transcrab.onev.cat/a/<yyyy>/<mm>/<slug>/
```

Only reply with the final page URL after it returns **200**.

## Output

- Private repo has the new article **including `zh.md`** (and is pushed)
- Deployed page URL is reachable (HTTP 200)
- Reply with the deployed page URL
  - Canonical path: `/a/<yyyy>/<mm>/<slug>/` (yyyy/mm derived from `date` in `zh.md`, UTC)

## Customization points

- Default target language
- Slug rules
- Whether to store raw source
