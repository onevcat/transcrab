# TransCrab

A small local-first pipeline:

1) fetch an article URL → extract main content
2) convert HTML → Markdown (keeps structure)
3) translate Markdown (default: zh-Hans)
4) build a static site (Astro)

This repo is designed for **local generation + static deployment** (Netlify/Vercel).

> Note on content & licensing:
> This template repo does **not** ship with translated third‑party articles.
> When you use TransCrab, please make sure you have the rights to store/translate/publish content.

## Requirements

- Node.js 22+
- OpenClaw gateway running locally (ws://127.0.0.1:18789)

## Quick start

```bash
npm i
npm run dev
```

## Add an article

```bash
node scripts/add-url.mjs "<url>" --lang zh --model openai-codex/gpt-5.2
```

Outputs are stored under `content/articles/<slug>/`:
- `source.md` (original Markdown)
- `zh.md` (translated)
- `meta.json`

## Build

```bash
npm run build
```

## Deploy (Netlify)

- Build command: `npm run build`
- Publish directory: `dist`

