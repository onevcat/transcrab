# 🦀 TransCrab

TransCrab is **OpenClaw-first**: a small, stable capability you add to an OpenClaw assistant so it can turn links into a polished translated reading page.

This is not a generic “for humans” app. It’s a **template for OpenClaw assistants** (bots) to install, operate, and keep updated.

---

## What you get

After setup, your OpenClaw assistant can take a link + the keyword `crab` and:

1) fetch the page
2) extract main content
3) convert HTML → Markdown
4) translate Markdown (default: zh-Hans)
5) commit + push to your repo
6) your static hosting provider rebuilds → you get a page URL

---

## Install (human prompt)

Send this to your OpenClaw assistant (copy/paste):

```text
Help me install and deploy TransCrab:
https://github.com/onevcat/transcrab
```

---

## Install (for OpenClaw assistant / bot)

Follow the steps below. You may also refer to `scripts/BOOTSTRAP.md`.

### Two lessons from real-world cold-start tests (read this first)

1) **GitHub Pages needs explicit site/base config**
   - When deploying to GitHub Pages under a repo path (e.g. `https://USER.github.io/REPO/`), you must set Astro config correctly.
   - `astro.config.mjs` must use a real `site` (not `localhost`) and a correct `base` **with a trailing slash**.
   - If you don’t, home page might work but internal links/assets will 404.

2) **The assistant must translate automatically (never ask the user to paste translations)**
   - Scripts do not call `openclaw agent` (by design), but the *running assistant* is still responsible for doing the translation.
   - Do **not** degrade UX by asking the user to manually translate or paste back the translation.
   - Your job is: generate prompt → translate in-conversation → apply translation → commit/push → reply with URL.

### 0) Ask the user for required info

- Their fork repo URL (or permission to fork `onevcat/transcrab` into their account)
- Which hosting provider they prefer (Netlify / Vercel / Cloudflare Pages / GitHub Pages / etc.)
- Their site URL (or whether they want you to create/configure it)
- Preferred default translation target language (default: `zh`)
- Preferred model (optional; if omitted, use the user's OpenClaw default model)

### 1) Repo + deployment

#### Hosting providers: common setup vs platform quirks

Most providers can deploy this Astro static site with:
- Build command: `npm run build`
- Publish directory: `dist`

But **platforms differ** in one important way:

- **Netlify / Vercel / Cloudflare Pages**: usually serve from the domain root. Base-path issues are rare.
- **GitHub Pages (repo pages)**: serves from `/<repo>/` — you must configure Astro:

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://<user>.github.io',
  base: '/<repo>/', // NOTE trailing slash
});
```

Also ensure your internal links and static assets respect `import.meta.env.BASE_URL` (or are relative).

- Fork/clone the repo into the user’s workspace
- Install dependencies for scripts:
  - Prefer `npm ci` (recommended for bots / reproducible installs)
  - Fallback `npm i` if needed
- (Optional but recommended once) Verify the site builds: `npm run build`
- Deploy the user’s fork on their chosen provider
  - Default recommendation: Netlify
  - But do not assume Netlify is required

Build settings (common for most providers):
- Build command: `npm run build`
- Publish directory: `dist`

Runtime note (important):
- On the user’s device (where the bot runs scripts), you generally **do not** need to run `npm run build`.
- You *do* need dependencies installed so the scripts can run (prefer `npm ci`).

### 2) Runtime behavior contract (conversation UX)

- Do **not** run the pipeline on URL alone.
- Only run the default pipeline when the user sends a URL and then sends `crab`.
- If the user provides explicit instructions, follow them instead:
  - `raw <url>`: store source only
  - `sum <url>`: summary only
  - `tr:<lang> <url>`: translate to another language

#### Persist the contract (required)

If you don’t **persist** this rule, you will eventually break the UX:
- after a bot restart, it may forget what “URL + crab” means
- it may forget where the local clone is and where `scripts/run-crab.sh` lives

**You MUST ask the user for consent** before changing your long-term behavior.

Once the user agrees, persist the following to **one** of:
- `MEMORY.md` (simplest), or
- a dedicated skill (more robust; recommended)

Memory snippet to store (edit paths as needed):

```text
TransCrab behavior contract
- Trigger: run TransCrab only when user sends a URL and then sends `crab`.
- Repo path (private working copy): ~/Projects/transcrab-private
- Command: ./scripts/run-crab.sh <url>
- Notes: do not run on URL alone; ask before doing anything destructive.
```

#### Skill vs Memory — which is better?

- **Memory** is quick and good enough for personal setups.
- A **skill** is better for reliability and portability:
  - gives you a stable, explicit instruction source
  - can include checks (repo exists, script exists) before running
  - is easier to share / version-control

This repo ships an optional starter skill under `skills/transcrab/`.

### 3) How to run the pipeline (built-in scripts)

This template already includes scripts you can call:

- `scripts/add-url.mjs`: fetch → extract → HTML→Markdown → write `source.md` + `meta.json` + translation prompt
- `scripts/apply-translation.mjs`: write `<lang>.md` from translated Markdown (from stdin or file)
- `scripts/run-crab.sh`: thin wrapper around `add-url.mjs`
- `scripts/sync-upstream.sh`: keep a fork up to date with template changes

### 4) Safety note (script review)

Before running automation on a user’s machine, you should quickly read the scripts you are about to execute.

- Skim `scripts/add-url.mjs` to understand:
  - it performs network fetches to the target URL
  - it writes files under `content/articles/**`
  - it **does not** run model calls by itself (it only generates a translation prompt)
- Skim `scripts/apply-translation.mjs` to understand:
  - it writes `<lang>.md` under the article directory
- If you see anything that looks risky or unexpected (running arbitrary shell commands, touching unrelated paths, etc.),
  **warn the user and ask for confirmation**.

### 5) Translation mechanism (what actually happens)

Translation is intentionally **not performed by scripts**.

**However, translation IS performed automatically by the running OpenClaw assistant.**

- Do **not** ask the human to manually translate content.
- Do **not** ask the human to paste a translated result back.
- If translation output is too long for one message, you (the assistant) should chunk your own output internally (or write to a temp file) and still complete `apply-translation` yourself.

Why? Calling `openclaw agent` from inside a script can cause nested/recursive agent execution and hang in real deployments.

Instead:

- `scripts/add-url.mjs` generates a strict translation prompt and writes it to:
  - `content/articles/<slug>/translate.<lang>.prompt.txt`
- The running OpenClaw assistant translates that prompt in the current conversation (using the user’s default model/provider).
- `scripts/apply-translation.mjs` writes the translated markdown to:
  - `content/articles/<slug>/<lang>.md`

This keeps the UX stable and avoids deadlocks.

### 6) Output format

On `URL + crab`, write under `content/articles/<slug>/`:

- `source.md`
- `meta.json`
- `translate.<lang>.prompt.txt`

After the assistant translates, write:

- `<lang>.md` (e.g. `zh.md`)

Then commit + push to `main` and reply with the deployed page URL.

Canonical deployed path (this template):
- `/a/<yyyy>/<mm>/<slug>/` (`yyyy/mm` derived from the article `date` in `zh.md`, UTC)

---

## Updating (when this template changes)

In a fork clone:

```bash
./scripts/sync-upstream.sh
```

---

## Requirements

- Node.js 22+
- OpenClaw gateway running locally
- A configured model provider in OpenClaw (any working default model)

## License

MIT
