---
title: How I Organize My Second Brain With Obsidian Bases and Claude Code
date: '2026-03-21T07:28:25.907Z'
sourceUrl: 'https://x.com/noahvnct/status/2035013355530772791?s=20'
lang: source
---
In this article, you'll learn:
↱ Why folder-based systems like PARA create hidden cognitive friction every time you open your second brain, and the architectural shift that eliminates it permanently
↱ How Obsidian Bases turns your notes into a self-organizing database where every note can be found from any angle without ever choosing a single location
↱ How Claude Code lives inside your vault and maintains your entire knowledge system automatically, so the database never degrades

## Introduction: The Hidden Tax of Every Folder System

Every time you create a note, you pay a tax.

You write the idea down. Then you freeze. Is this a project? A resource? An area? Which folder does it actually belong in? You spend thirty seconds deciding. You pick one. You move on. And somewhere in the back of your mind, you know you picked wrong, or at least that you could have picked differently.

That tax is small each time. But it happens hundreds of times a week for anyone who works with knowledge seriously. And there is a second tax, paid on retrieval: you have to remember not just what you wrote, but where you put it. You open folders, scan subfolders, and come back empty.

The system that was supposed to free up your thinking is consuming it instead.

I spent years inside that loop. I tried PARA. I tried Zettelkasten. I tried building a hybrid of both. The systems were smart, but they were all built for the same flawed assumption: that notes belong in locations. I finally found a way out when I stopped thinking about where notes go and started thinking about what notes are.

This article walks through the exact system I use today. It is built on [Obsidian](https://obsidian.md/) Bases and [Claude Code](https://claude.ai/download). By the end you will understand the full architecture, how to navigate it, and how to get a pre-built version of the entire vault for free.

Prefer to watch? The full walkthrough with live demos of every section in this article is on YouTube: [https://youtu.be/r4nea7QCkfQ](https://youtu.be/r4nea7QCkfQ)

Get the free vault: The Sovereign Creator OS Lite is a ready-to-open Obsidian vault with everything pre-configured. Download it here: [Sovereign Creator OS Lite](https://noahsark.podia.com/sovereign-creator-os-lite)

## Why PARA Was Never Going to Work

My previous system was a hybrid I called IPARAG: Inbox, Projects, Areas, Resources, Archives, and Galaxy. The PARA part came from Tiago Forte and handled project and resource management. The Galaxy was my Zettelkasten layer where I kept all my permanent notes in a flat file structure, connected through wikilinks.

The Galaxy was genuinely powerful. Once I had enough atomic notes linked to each other, content creation became fast. I could pull from my own thinking instead of starting from scratch every time. That part worked.

The rest had a structural flaw that no amount of refinement could fix.

The flaw is this: a single note can belong in multiple places at once. Is a note about content strategy a Project file or a Resource? Is it in the Business area or the Content folder? PARA does not answer that question. It forces you to pick one and live with the doubt. Every time you retrieve something, you have to guess whether past-you filed it correctly.

The system was also built for folder-based tools. I was using Kortex and Eden to manage my second brain at the time. In a folder-based world, PARA is probably the best solution available. But the tool I'm now using is Obsidian, and Obsidian has recently released a feature that changes everything: Bases.

I spent a week learning how to use it, mostly by studying how Kepano approaches it. Kepano is the founder of Obsidian himself. After that week, I rebuilt my entire vault from scratch. The result is what I am going to walk you through here.

## The Architecture: Five Folders, No Hierarchy

The entire system runs on five folders.

The Inbox is the capture zone. Everything unprocessed lands here. Random ideas, downloaded files, voice memos, web clips. You do not sort anything into Inbox. You just dump it in and process it later. Claude Code processes mine automatically, but I will get to that.

The Notes folder is where every single note in the system lives. One flat folder, no subfolders, no exceptions. Nine hundred files and counting, all at the same level. This is not chaos. It is intentional, and the reason it works is the next two folders.

Categories and Subjects are the navigation layer. They are not storage. Notes do not live there. These folders contain container notes that surface and organize notes from the flat Notes folder dynamically. The details of how this works are the core of the system.

The System folder holds templates, attachments, dashboards, etc. All that's needed for maintaining the system.

The core philosophy shift this architecture represents is simple: folder systems require you to decide where a note belongs before you can store it. This system asks only one question: what is this note? Once you answer that, the system finds it for you.

## How Categories Work: A Filter, Not a Folder

A category is a type of object that exists in your vault. Permanent notes, newsletters, YouTube videos, tweets, SOPs, reviews, AI prompts, projects, products. Every note belongs to at least one category.

The critical difference from folders: a note can belong to multiple categories simultaneously. A YouTube script can be both a YouTube Video and a Script. A newsletter can be both a Newsletter and a Swipe File. The note lives once, in the flat Notes folder. The categories just describe what it is.

To make this work, each category is a container note with an [Obsidian Bases](https://obsidian.md/) view embedded inside it. Bases is a core plugin built into Obsidian. You do not need to download anything. It turns your notes into a database, similar to what Notion does, but with plain markdown files on your local machine.

The database view inside each category container has one rule: show me every note in this vault that links to this category.

The link works through YAML frontmatter, which is the block of metadata at the top of every note. A newsletter has this in its metadata: categories: "[[Newsletters]]". That one line is a wikilink to the Newsletters container. The moment you add it, the note appears inside the Newsletter container with zero additional action. No sorting, no dragging, no filing.

This is what PARA could never achieve. A note is not stuck in one location. It can be found from any angle you think to look.

## How Subjects Work: The Second Navigation Layer

Categories answer one question: what type of note is this? Subjects answer a different one: what is this about?

Subjects are themes that cut across all categories. Business, creativity, psychology, philosophy, health, productivity, relationships, etc. Any note can have subjects in addition to a category. A newsletter about psychology gets two properties: categories: [[Newsletters]] and subjects: [[Psychology]].

That newsletter appears inside the Newsletters container alongside every other newsletter. It also appears inside the Psychology subject container alongside every other psychology note in the vault, including permanent notes, tweets, videos, and anything else with that subject property. The same note, surfaced from two completely different angles, with one addition to its metadata.

This replaces the entire tag system I used before. Tags in Obsidian work technically, but they are invisible. You forget what tags exist. They pile up. You have no easy way to browse or explore them. Subject containers are visible, named, and navigable. You open them like a page. It is a cleaner and more powerful way to navigate a knowledge base.

## How Capture Works: One Action, Fully Organized

The daily capture workflow is straightforward.

You create a note. It lands automatically in the flat Notes folder. You apply the matching template. Newsletter, Tweet, Permanent Note, YouTube Video, each category has its own template. The template auto-fills the YAML frontmatter: the category link, the status, the type. You do not write any of that yourself. You just apply the template and start writing.

The moment you apply the template, the note appears in the correct category container. The system is already organized.

A template is nothing more than a pre-written YAML block plus a content structure. When you apply the Newsletter template, it adds the category link and sets the status to "idea". You get a blank document ready to fill, pre-routed to the right place.

The moment this clicked for me was when I realized I had stopped thinking about where to put notes entirely. I was only thinking about what I was writing. That shift sounds small. It is not. Friction at the capture stage is what kills second brain systems. Most people build something, use it for a few weeks, and abandon it because every capture requires a decision. Remove the decision and you actually use the system.

## What Changes When Claude Code Lives in Your Vault

Claude Code is an AI agent that runs directly inside your Obsidian folder. It reads your files, writes files, and understands your system from the first prompt of every session.

The reason it always understands your system is the CLAUDE.md files. Every folder in the vault has one. These files explain what lives in that folder, what the categories mean, and how notes should be structured. Claude reads them automatically at the start of each session. You configure them once. Claude picks them up every time.

The practical result is a maintenance layer you never have to think about.

You can ask it to create a newsletter note about any topic, and Claude will create the file with the correct YAML, the right template, and the right status already set. You can say "process my inbox," and Claude reads every file in the Inbox folder, assigns the correct category and subject, and moves it to Notes. You can say "add the Psychology subject to every newsletter that mentions mental models," and Claude updates thirty notes in twenty seconds.

The combination is precise: Obsidian Bases organizes your knowledge visually. Claude Code maintains it automatically. You use the system. Claude runs it. I have not manually managed my database since I set this up.

The other dimension this unlocks is content creation. Because Claude has access to your entire second brain, every note you have ever taken and every piece of content you have ever created, it uses that as context and source material. For Example, you can ask Claude to write a newsletter, and it will synthesize five relevant notes from your vault, write in your voice, and use your own ideas as source material. Generic prompts with generic AI produce generic output. AI with full context over a well-organized knowledge base produces something else entirely.

## Get the Vault Pre-Built

You do not have to build any of this from scratch. I did it for you.

The Sovereign Creator OS Lite is a ready-to-open Obsidian vault with the full system already configured. It includes 10 category containers with Bases queries already set up, 7 subject containers, templates with YAML pre-filled, 8 AI prompts ready to paste into Claude, 3 SOPs covering the complete workflow from capturing content to publishing it, and CLAUDE.md files in every folder so Claude Code understands your system from day one.

To get it, follow this link: [Sovereign Creator OS Lite (free)](https://noahsark.podia.com/sovereign-creator-os-lite). Create a free account, log into the course platform, download the zip, and open it in Obsidian. Configure three settings. Done. Under five minutes from download to a fully operational second brain.

## Why This Matters Beyond the System

The goal here is not to have a beautiful vault. A beautiful vault you never use is just a more aesthetically pleasing version of the same problem.

The goal is to build a second brain that compounds over time. Every note you write, every idea you capture, every piece of content you create: it all connects inside this system. The knowledge you build today funds the content you create next month. The ideas you capture this year become the product you launch next year. The system makes that compounding automatic, so you are not rebuilding from scratch every time you sit down to create.

The bigger picture I am working toward with Noah's Ark is a three-act progression. Act one: build a sovereign second brain. Own your knowledge. Own your tools. Own your data. Act two: turn that knowledge into a profitable creator business. Act three: use the system to fulfill your potential in every area of life. This vault is the foundation. Everything else builds on top of it.

## Conclusion

The problem with folder systems was never the folders themselves. It was the assumption underneath them: that notes belong in locations, and that you should be the one deciding where.

Categories and Bases replace that assumption with something better: notes belong to what they are. You describe them. The system finds them. And with Claude Code running inside the vault, even the describing gets automated.

The Sovereign Creator OS Lite gives you the complete pre-built version of this system for free. Download it, open it in Obsidian, and start using it today: [Sovereign Creator OS Lite](https://noahsark.podia.com/sovereign-creator-os-lite).

Subscribe to the newsletter and follow me if you want more on building AI-powered second brains and turning your knowledge into a creator business. If you have questions, reply to any of my emails or ask in the comments below.

Welcome back to Noah's Ark. See you soon.
