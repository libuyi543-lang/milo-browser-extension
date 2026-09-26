<p align="center"><img src="assets/icon-128.png" width="88" alt="Milo mascot with a blue pencil"></p>
<h1 align="center">Milo Translator Extension</h1>
<p align="center"><strong>"Translation is the beginning. Keep the words you meet in their native context."</strong></p>
<p align="center">Context-aware progressive AI bilingual reading & vocabulary building Chrome extension</p>
<p align="center">
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/releases/latest">Download Package</a> ·
  <a href="docs/INSTALL.md">Installation Guide</a> ·
  <a href="README.md">中文文档</a> ·
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/issues">Issues & Feedback</a>
</p>
<p align="center">
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/actions/workflows/build.yml"><img src="https://github.com/libuyi543-lang/milo-browser-extension/actions/workflows/build.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/v/release/libuyi543-lang/milo-browser-extension" alt="Latest release">
  <img src="https://img.shields.io/badge/Chrome-128%2B%20%7C%20Manifest%20V3-5c7f6e" alt="Chrome 128+ Manifest V3">
  <img src="https://img.shields.io/badge/LLM-DeepSeek%20Flash%20API-blue" alt="DeepSeek LLM">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-5c7f6e" alt="MIT License"></a>
</p>

![Milo reading and vocabulary workflow](docs/images/cover.png)

When reading English articles or scrolling X/Twitter feeds: **Select a word → View definitions → Add to Milo**. The source sentence, page title, URL, and timestamp are captured automatically. When you encounter and save the same word on a different page, Milo appends the new context and increments its "Encounter Count".

> 💡 **Product Vision**: Milo Translator Extension is the desktop companion for the Milo vocabulary ecosystem. It bridges the gap between passive reading and long-term retention: **"Immersive Reading ➔ Context Capture ➔ Knowledge Consolidation"**.

---

## 💡 Why Milo Translator?

```mermaid
flowchart LR
    A[English Paragraphs] -->|⌘A Shortcut / Text Selection| B(Milo Lightweight Engine)
    B -->|Preserve DOM Layout| C[Progressive Inline Bilingual Display]
    B -->|Extract Sentence & URL Context| D{DeepSeek Rapid Inference}
    D -->|Sub-second Latency| E[Minimal Non-Intrusive Tooltip]
    E -->|One-Click Save| F[(Local Chrome / SQLite Store)]
    F -->|Auto Append Encounters| G[Multi-Context Memory Retention]
```

1. **Unbroken Reading Flow**: Conventional translation modals are clunky, while full-page auto-translation destroys linguistic immersion. Milo injects clean, progressive translations right beneath original paragraphs with a single keystroke.
2. **Context-Anchored Learning**: Memorizing isolated wordlists fails. Milo ensures every word is remembered alongside the real sentence and situation where you first met it.
3. **High-Frequency, Low-Cost Automation**: Backed by high-speed DeepSeek LLM endpoints, intelligent LRU caching, and request de-duplication to minimize API costs and latency.

---

## ✨ Features & Showcase

### 01 · Select and Keep the Context

![Milo selection popup rendered with demo data](docs/images/selection.png)

- Lightweight tooltip offering accurate part of speech, Chinese definitions, and source sentence.
- One-click capture: store where, when, and how you encountered the word.

### 02 · Progressive Inline Bilingual Reading

![Inline bilingual reading rendered with demo data](docs/images/bilingual.png)

- Press **⌘ A** (macOS) or **Ctrl+A** (Windows) to reveal translations under each paragraph without destroying layout; press again to seamlessly restore. Textareas and code editors retain their native select-all behaviors.
- Optimized for **X / Twitter**: specifically targets post content and replies while filtering out noise (navigation, sidebars, metrics, profile links).

### 03 · Every Encounter Counts

![Local vocabulary notebook rendered with demo data](docs/images/notebook.png)

- Toolbar popup displays recently captured words and encounters. Saving an existing word appends a new context slice rather than creating clutter.

---

## ⚡ Quick Start (3 Minutes)

1. Download the latest pre-built ZIP from [Releases](https://github.com/libuyi543-lang/milo-browser-extension/releases/latest) and unzip it;
2. Navigate to `chrome://extensions` in any Chromium browser;
3. Toggle on **Developer mode** (top right) and click **Load unpacked** (top left);
4. Select the unzipped folder;
5. Click the Milo icon in your toolbar, input your **DeepSeek API Key**, and start reading!

---

## 🛠️ Architecture & Performance

| Mechanism | Implementation Details | User Benefit |
| :--- | :--- | :--- |
| **Multi-Tier Caching** | Words cached for 30 days, paragraphs for 7 days (max 500 entries / ~1MB) | Instant hits, zero network lag, reduced API costs |
| **Request De-duplication** | In-flight duplicate requests share promises; max 2 concurrent network jobs | Prevents API bottlenecks and redundant billing |
| **Intelligent Debounce** | Queries trigger only after 150ms selection stability; closing cancels network stream | Eliminates accidental selections and wasted tokens |
| **Viewport-First Render** | Prioritizes paragraphs within visible viewport; chunked processing for long reads | Silky-smooth reading on long technical papers |

---

## 🔒 Privacy & Security

- **Local-Only Storage**: Your API Key is stored securely in `chrome.storage.local`. Injected webpage content scripts cannot access it.
- **Direct Endpoints**: Requests connect directly to `api.deepseek.com` without intermediate private servers.
- **Zero Tracking**: No browsing history, URLs, or private notebooks are tracked or collected.

---

## 💻 Local Development

```sh
git clone https://github.com/libuyi543-lang/milo-browser-extension.git
cd milo-browser-extension

corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --frozen-lockfile

yarn test
yarn build
yarn package
```

---

## 🤝 Community & Acknowledgments

- If Milo helps you read better, please give this repo a ⭐️ **Star**!
- Built with React, TypeScript, RxJS, and Chrome Manifest V3.
- Partial architecture draws inspiration from [Saladict](https://github.com/crimx/ext-saladict). We thank CRIMX and community contributors for their foundational work. Licensed under [MIT](LICENSE).
