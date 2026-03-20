你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: technical
- style: technical
- auto-resolved-mode: refined
- auto-resolved-audience: technical
- auto-resolved-style: technical
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；主题信号不明显，回退到 technology
- pipeline: analyze -> translate -> review -> revise
- 执行策略：自动判断（auto）。
- 发布流程固定按 refined 质量标准执行。
- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。
要求：
- 保留 Markdown 结构（标题/列表/引用/表格/链接）。
- 代码块、命令、URL、文件路径保持原样，不要翻译。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
A couple days ago [I tweeted about an experiment I was running](https://x.com/danveloper/status/2033940227736100873) with Claude Code to see if I could get Qwen 3.5 397B running on my MacBook Pro. Not a distilled version or a smaller model, but the actual 397 billion parameter Mixture-of-Experts model that takes up 209 GB on disk, on a machine with 48 GB of RAM.

This is something I've been waiting to become possible ever since I read Apple's ["LLM in a Flash"](https://arxiv.org/pdf/2312.11514) paper three years ago. The paper laid out a clear thesis for running models that exceed DRAM capacity by streaming weights from flash storage, and Apple had been shipping hardware that seemed purpose-built for exactly this kind of workload. I've been waiting and waiting for Apple to do something with it, and they just haven't. Running really big models locally has been a bit of a white whale for me, because local AI is incredibly compelling but smaller models just aren't very smart, and they still push GPU and memory pretty hard on their own. What I wanted was frontier-class intelligence running on hardware I own, and I've had this assumption for a while now that Apple's architecture should make it possible.

The thing is, I personally have never been smart enough to be able to do this kind of work on my own. The Metal shaders, the Objective-C inference engine, the low-level I/O optimization, none of that is in my wheelhouse. But the timing has finally come together with everything in the AI ecosystem that made this achievable. Opus 4.6 is incredibly, incredibly smart, and Claude Code makes agentic engineering a real thing that we can actually do now. Anthropic has made it so that tool calls can just run in a loop seemingly forever, which means you can point an agent at a hard problem and let it iterate autonomously. Karpathy's autoresearch methodology came at precisely the right time for me to be able to work through this problem with Claude and make it something that could actually become a reality. All the stars aligned, and it turned out that giving Opus a metric to optimize and a goal to "never stop until you hit this number" was the missing piece.

![](https://pbs.twimg.com/media/HDtyosvbcAAHMwd.png)

It ended up working at 5.7 tokens per second sustained with a max token throughput of 7.07, all while preserving production-quality output, using about 5.5 GB of resident memory. And at those speeds, the hardware itself is barely even being touched, which leads me to believe there's quite a lot more we're leaving on the table.

The paper and code are up at [https://github.com/danveloper/flash-moe](https://github.com/danveloper/flash-moe).

I want to be really clear about something before I go any further, because I think it matters for understanding what this kind of work looks like now. I did not write any of this code. Not the Objective-C inference engine (about 5,000 lines), not the Metal shaders (about 1,100 lines), not the 2-bit requantization pipeline, not the tests. Claude wrote all of it. My role was to give it the idea and the right set of reference materials (the LLM in a Flash paper, brilliant articles from @maderix who has recently reverse-engineered the Apple Neural Engine, and Karpathy's autoresearch repo), let it loose, and then once it had reached a certain point in the research and started hitting plateaus, to come in and collaborate with it on the performance optimizations and push it to the next level. That collaboration model, where the agent does the implementation work and the human provides direction and systems-level insight at plateau points, ended up being a really effective way to work. The whole journey was about 24 hours and 90 experiments, and 42% of those experiments were discarded. The failures were as informative as the successes.

I want to talk about how the system works, but I think the more interesting story is actually about the hardware I ran it on...

Every design decision Apple made in pursuit of "thin and light" turned out to help with what we're trying to do here. When they moved everything onto a single chip, they wired the CPU, GPU, and SSD controller together with copper. They did it because it made laptops thinner and more power efficient, but it also means that data moving between storage and the GPU doesn't have bus-hopping costs. My M3 Max does 17.5 GB/s sequential reads from the SSD, which is 3x faster than what Apple measured on the M1 Max in their own “LLM in a Flash” paper, and it all flows through a unified memory architecture where the CPU and GPU share the same physical memory space. On top of everything is the fact that there are hardware caches everywhere along the way. A lot of what this project ended up being was a cache optimization problem, and the most important optimization we found was to stop trying to outsmart the hardware's caches with our own.

MoE models turned out to work really well for this because they're absurdly sparse at inference time. Qwen 3.5 397B has 512 experts per layer but only activates 10 per token, and we found you can prune that down to 4 with no quality degradation (K=3 causes immediate quality collapse, which suggests the routing learned to distribute critical computation across exactly 4 experts). That means less than 2% of expert weights are needed for any given token, and we were able to 2-bit requantize the expert weights with negligible quality loss (RMSE of 0.001 to 0.003 per layer), which cut expert storage from 209 GB to 120 GB. So you end up with a relatively small number of relatively small weight blocks to stream from disk per token, and if you can deliver them fast enough, you never need to hold the model in memory at all.

That said, the non-deterministic routing in MoE models actually makes cache optimization harder than it would be with a dense architecture, because you don't know in advance which experts you're going to need for the next layer. A thick dense model where the next layer's weights are always predictable would probably be even better for this kind of streaming inference, since you could actually pre-fetch effectively. Something to explore.

The inference engine itself is written in Objective-C and Metal Shading Language with no Python anywhere in the hot path and no ML framework. It streams expert weights from disk and runs them through a fused three-command-buffer GPU pipeline where the CPU is loading the next layer's experts while the GPU is still computing the current layer's results.

The most counterintuitive finding of the whole project was that deleting the carefully engineered 9.8 GB Metal LRU expert cache and just letting macOS handle caching on its own made everything 38% faster. Claude built a sophisticated application-level cache in GPU-visible shared memory, and it was actively hurting us. What was happening was that the Metal cache's GPU-visible pages forced Apple's hardware memory compressor to work continuously at 60,000 to 130,000 decompressions per second, burning 1 to 2 GB/s of memory bandwidth just on housekeeping. Remove the cache, the compressor goes quiet, decompressions drop to near zero, and all that bandwidth becomes available for useful work. This is the same lesson that PostgreSQL's documentation teaches about not building application-level buffer pools that compete with the OS buffer cache, and it ended up being the theme of the whole project: trust the hardware, get the software out of the way.

The theoretical throughput floor for this system, limited only by SSD bandwidth, is 18.6 tok/s. We're at 5.7, and the hardware is barely breaking a sweat, which means there's a lot of room left to push. The M4 Max should have around 25 GB/s SSD bandwidth, which gets you to roughly 8 tok/s with zero software changes, and Apple's SSD bandwidth improves about 20% per generation. Within 2 to 3 hardware generations, 10+ tok/s on a 400 billion parameter model on a laptop is just the baseline.

This approach also generalizes beyond Qwen. DeepSeek-V3 at 671B with 37B active is an obvious candidate, and really any MoE model where expert weights dominate total parameters works with this approach.

Apple published "LLM in a Flash" three years ago telling everyone that the SSD is a perfectly viable weight store, and then they consistently shipped hardware that proves exactly that. SSD performance is improving every single year, and I’m hopeful that we’ll start to see more and more frontier models from open source labs that just, you know, run on your computer. I’m deeply grateful to the MLX open source community for all the hard work they continue to do to take advantage of Apple hardware’s AI potential. None of this would’ve been possible without having MLX as a starting spot. I’m long on Apple. They have a secret weapon in AI, and we’re just beginning to see its potential.
