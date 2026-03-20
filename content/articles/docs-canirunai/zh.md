---
title: CanIRun.ai 术语表
date: '2026-03-20T02:55:47.121Z'
sourceUrl: 'https://www.canirun.ai/docs'
lang: zh
---
Key terms and concepts used on CanIRun.ai, explained simply.

## Parameters

When you see "7B" or "70B", that's the number of parameters (weights) in the model — in billions. More parameters generally means the model is smarter and more capable, but also needs more memory and is slower to run. A 7B model is great for basic tasks, 13B–34B is a solid sweet spot, and 70B+ delivers near-frontier quality but needs serious hardware.

Size vs capability tradeoff

1-3B Fast 7-8B Good 13-14B Better 27-34B Great 70B Excellent 405B+ Frontier ↑ Smarter ↓ Faster

## Quantization

Quantization reduces the precision of a model's weights to make it smaller and faster, at the cost of some quality. The names tell you the bit-width:

Quality vs size (for a 7B model)

Format Quality Size F16 ~13 GB 100% Q8_0 ~6.7 GB ~99% Q6_K ~5.3 GB ~95% Q4_K_M ~3.9 GB ~88% ★ Q2_K ~2.5 GB ~60% Bar = quality retention vs original • ★ = best balance

| Format | Bits | Quality | Notes |
| --- | --- | --- | --- |
| Q2_K | 2 | Low | Smallest size, noticeable quality loss |
| Q4_K_M | 4 | Good | Best balance of size and quality — most popular |
| Q6_K | 6 | Very good | Near-lossless, moderate size increase |
| Q8_0 | 8 | Excellent | Minimal quality loss, larger file |
| F16 | 16 | Original | Full precision, largest size |

## VRAM

VRAM is the memory on your GPU. To run a model, the entire quantized file needs to fit in VRAM (or in unified memory on Apple Silicon). If a model needs 8 GB of VRAM and your GPU has 6 GB, it won't run well — it'll either fail or fall back to much slower CPU inference.

## MoE (Mixture of Experts)

A Mixture of Experts model splits its parameters into groups called "experts." On each token, only a few experts are active — for example, Mixtral 8x7B has 46.7B total parameters but only activates ~12.9B per token. This means you get the quality of a larger model with the speed of a smaller one. The tradeoff: the full model still needs to fit in memory, even though only part of it runs at inference time.

MoE expert routing (Mixtral example)

Token Router top-2 Expert 1 ✓ Expert 2 ✓ Expert 3 Expert 4 ... ×8 experts total Output Active: ~12.9B Total: 46.7B VRAM: all 46.7B

## Dense vs MoE Architecture

A **dense** model activates all its parameters for every token — what you see is what you get. A **MoE** model has more total parameters but only uses a subset per token. Dense models are simpler and more predictable in terms of memory/speed. MoE models can punch above their weight in quality but need more VRAM than their active parameter count suggests.

## Context Length

Context length is how many tokens the model can process at once — input and output combined. A "128K context" model can handle roughly 100,000 words in a single conversation. Longer context is great for analyzing documents or long conversations, but uses more memory. Most local usage works fine with 4K–8K context.

## Tokens per Second (tok/s)

This is the inference speed — how fast the model generates text. A rough guide:

*   60+ tok/s — Instant feel, great for interactive use
*   30–60 tok/s — Fast and comfortable
*   15–30 tok/s — Usable, slight wait
*   5–15 tok/s — Workable for batch tasks
*   <5 tok/s — Painful for interactive use

## GGUF Format

GGUF is the file format used by [llama.cpp](https://github.com/ggerganov/llama.cpp) and tools like Ollama, LM Studio, and GPT4All. It stores quantized model weights in a single file that's ready to run on CPU or GPU. When you download a model from HuggingFace for local use, you're usually looking for the GGUF version.

## Memory Bandwidth

Memory bandwidth (measured in GB/s) determines how fast data can be read from VRAM. During inference, the bottleneck is reading model weights from memory — so higher bandwidth means more tokens per second. This is why Apple Silicon Macs (with high unified memory bandwidth) can run larger models surprisingly well, and why an RTX 4090 generates text faster than an RTX 4060 even at the same VRAM usage.

Memory bandwidth comparison (GB/s)

RTX 4060 272 M4 Pro 273 RTX 4070 504 M4 Max 546 7900 XTX 960 RTX 4090 1008 RTX 5090 1792 Higher bandwidth = faster tok/s at same model size

Built by [midudev](https://midu.dev/) for the local AI community

All product names, logos, and brands are property of their respective owners. Apple, NVIDIA, AMD, Intel, Qualcomm, and all AI model names mentioned on this site are trademarks or registered trademarks of their respective holders. This site is not affiliated with or endorsed by any of these companies.
