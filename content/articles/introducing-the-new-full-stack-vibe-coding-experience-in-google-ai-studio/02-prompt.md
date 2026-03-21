你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: general
- style: conversational
- auto-resolved-mode: refined
- auto-resolved-audience: general
- auto-resolved-style: conversational
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；生活叙事关键词命中较高，判定为 life
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
Today, we are launching a completely upgraded vibe coding experience in [Google AI Studio](https://aistudio.google.com/), designed to turn your prompts into production-ready applications. From multiplayer experiences and installing external libraries to ways to save your progress and log in securely, you can now build truly functional, AI-native applications without ever leaving the vibe coding experience.

We’re accelerating the path from prompt to production using the new [Google Antigravity](https://antigravity.google/) coding agent. To further support modern scalable applications, we are also enabling robust backends that bring secure storage and user authentication to your apps via a [built-in Firebase integration](https://firebase.blog/posts/2026/03/announcing-ai-studio-integration).

## Experience the difference, from prototypes to production apps

Here’s how the new updates help you build real apps:

- Build multiplayer experiences: Create real-time multiplayer games, collaborative workspaces and shared tools that can connect users instantly.
- Add databases and authentication: The agent now proactively detects when your app needs a database or login. After you approve a Firebase integration, it provisions Cloud Firestore for databases and Firebase Authentication for a secure sign-in with Google.
- Create for the modern web: The agent now uses the vast ecosystem of modern web tools. If you want smooth animations or professional icons, the agent automatically figures out the right solution — like installing Framer Motion or Shadcn — to bring your vision to life.
- Connect to real-world services: Turn prototypes into production-grade software by connecting to the services you already use. You can now bring your own API credentials to securely integrate services like databases, payment processors or Google services like Maps. The agent detects when a key is required and safely stores it in the new Secrets Manager located in the Settings tab.
- Pick up where you left off: Access your data across devices and sessions. Close the browser tab and the app remembers where you left off so you can continue whenever you’re ready to come back.
- Access a more powerful agent: Build complex apps using simpler prompts. The agent now maintains a deeper understanding of your entire project structure and chat history, enabling faster iteration and more precise multi-step code edits.
- Build with Next.js: In addition to React and Angular, we now support [Next.js](https://nextjs.org/) apps out of the box. Select your framework in the updated “Settings” panel.
See the new agent in action with Build mode. Here are a few examples of what you can build today:

## Real-time multiplayer games

You can now create a massive multiplayer first-person laser tag game in a retro style from just a prompt. Tag real life opponents or beat the AI bots to earn points on the leaderboard before time runs out and win.

Play or Remix [Neon Arena](https://aistudio.google.com/apps/bundled/neon_arena_laser_tag?) in Google AI Studio.

## Real-time collaboration

Imagine prompting for a "multiplayer experience using 3D particles." The agent automatically sets up the real-time syncing logic, imports Three.js and creates a shared space where each person's cursor spawns 3D particles that flow with curl noise.

Play or Remix [Cosmic Flow](https://aistudio.google.com/apps/bundled/cosmic_flow?) in Google AI Studio.

## Physics and game design

Create complex 3D interactions that adhere to real-world mechanics with ease. The new agent integrates claw machine physics, timers and a leaderboard importing Three.js for animations interactive 3D elements just by asking.

Play or Remix [Neon Claw](https://aistudio.google.com/apps/bundled/neon_claw?) in Google AI Studio.

## Connect to the real world

Introducing the new full-stack vibe coding experience in Google AI Studio to fetch live data from Google Maps or send updates to a database, turning a concept into a utility.

Play or Remix [GeoSeeker](https://ai.studio/apps/05066ca1-ceb3-4b8c-bdf1-da48f360f0ee) in Google AI Studio.

## Generate and Catalog Your Recipes

Organize and import recipes or generate new ones with Gemini. Collaborate with your friends and family to keep your culinary traditions alive.

Try or Remix [Heirloom Recipes](https://aistudio.google.com/apps/bundled/heirloom_recipes) in Google AI Studio.

Start building today

This new experience in Google AI Studio has already been used internally to build hundreds of thousands of apps over the last few months. We’re working on more integrations, like Workspace to connect Drive and Sheets to your apps, plus the ability to take your app from Google AI Studio to Google Antigravity with a single button click.

Whether you are building your first app or have agents building while you do other things, we hope these updates help accelerate your path from idea to deployed, production-ready app. Head over to [Google AI Studio](https://aistudio.google.com/apps) to try the new experience today.
