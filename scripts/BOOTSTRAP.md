# TransCrab bootstrap (FOR OPENCLAW ASSISTANTS)

This document is written for an **OpenClaw assistant (bot)**.

Your job is to help your human install and deploy TransCrab, then operate it reliably.

## Goal

After setup, the human can:

- send a URL
- then send `crab`

…and you will fetch → extract → markdown → **translate automatically (you do it)** → write files → commit/push, and return a deployed page URL.

> Critical UX rule: **Never ask the user to manually translate or to paste back translations.**
> The assistant must do the translation as part of the workflow.

> Important: scripts intentionally do **not** call `openclaw agent` to avoid nested/recursive agent execution.

## Built-in scripts in this repo

- `scripts/add-url.mjs` — fetch → extract → HTML→Markdown → write `source.md` + `meta.json` + translation prompt
- `scripts/apply-translation.mjs` — write `<lang>.md` from translated Markdown (from stdin or file)
- `scripts/run-crab.sh` — wrapper for `add-url.mjs`
- `scripts/sync-upstream.sh` — sync template updates into a fork

## One-time setup checklist

1) Confirm prerequisites
- Node.js 22+
- OpenClaw gateway is running locally
- A working model provider is configured (use the user's OpenClaw default model)

2) Ask the human for deployment details
- Which hosting provider do they prefer? (Netlify / Vercel / Cloudflare Pages / GitHub Pages / etc.)
- Do they already have a GitHub repo ready (fork) or should you fork `onevcat/transcrab` for them?
- Do they already have a site URL, or should you create/configure one and connect it to the repo?

Platform note (GitHub Pages):
- Repo pages are served under `/<repo>/`.
- You must set `astro.config.mjs` with a real `site` (not localhost) and `base: '/<repo>/'` (trailing slash).
- Internal links/assets should respect `import.meta.env.BASE_URL` (or be relative), otherwise the home page may load but article pages/assets 404.

3) Repo setup
- Clone the repo into the workspace
- Install dependencies (required for running scripts):
  - Prefer: `npm ci`
  - Fallback: `npm i`
- (Optional but recommended once) Sanity check the site build: `npm run build`

4) Deploy settings (common)
- Build command: `npm run build`
- Publish dir: `dist`

## Conversation contract

- URL alone is **not** a trigger.
- Only run the default pipeline when the human sends URL + `crab`.
- If the human provides explicit instructions, follow them instead:
  - `raw <url>`: store source only
  - `sum <url>`: summary only
  - `tr:<lang> <url>`: translate to another language

## Safety note (script review)

Before running automation on a user’s machine:

- Read `scripts/add-url.mjs` once.
- Confirm it only:
  - fetches the target URL
  - writes under `content/articles/**`
  - writes a prompt file under the article directory
- Read `scripts/apply-translation.mjs` once.
- Confirm it only:
  - writes `<lang>.md` under the article directory

If you see unexpected behavior (arbitrary shell commands, unrelated file access, destructive operations),
warn the human and ask for confirmation before running.

## Operating the pipeline

On `URL + crab`:

```bash
# Generate source.md + meta.json + prompt file
./scripts/run-crab.sh <url> --lang zh
```

`add-url.mjs` prints a JSON summary including the `slug` and `promptPath`.

Then:

1) Read the prompt file and translate it **yourself** in the running OpenClaw conversation.
   - Do not ask the user to do this step.
2) Write the translated Markdown into the repo (temp file is fine), then apply it:

```bash
# Option A: pipe via stdin
cat /path/to/translated.md | node scripts/apply-translation.mjs <slug> --lang zh

# Option B: from a file
node scripts/apply-translation.mjs <slug> --lang zh --in /path/to/translated.md
```

Finally, commit + push to `main`, **verify the deployed URL returns HTTP 200**, and reply with the deployed page URL.

## Updates

To sync upstream changes into the fork:

```bash
./scripts/sync-upstream.sh
```
