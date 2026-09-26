<p align="center"><img src="assets/icon-128.png" width="88" alt="Milo mascot"></p>
<h1 align="center">Milo Browser Extension</h1>
<p align="center"><strong>Translation is the beginning. Keep the words you meet.</strong></p>
<p align="center">Select a word · Save its context · Read English and Chinese together</p>
<p align="center"><a href="https://github.com/libuyi543-lang/milo-browser-extension/releases/latest">Download</a> · <a href="README.md">中文</a> · <a href="https://github.com/libuyi543-lang/milo-browser-extension/issues">Feedback</a></p>

![Milo reading and vocabulary workflow](docs/images/cover.png)

Milo is a desktop entry point for the Milo vocabulary notebook. Select an unfamiliar English word, see its Chinese meaning, then save it with the original sentence, page title, URL and time. Saving the same word again adds an encounter rather than a duplicate entry.

**This release stores data locally. Mobile sync, accounts and spaced repetition are not implemented yet.**

## Features

- Lightweight selection popup with a meaning, part of speech and source sentence.
- One-click vocabulary capture, reading context and encounter counts.
- Inline Chinese below English paragraphs. Press **⌘ A** on macOS or **Ctrl+A** on Windows to translate; press again to restore. Editors keep their native select-all behavior.
- X / Twitter translation focuses on main-column post, reply and article text, skipping navigation, profiles, timestamps, counters, link previews and sidebars.
- Your own DeepSeek key; local caching, request deduplication, cancellation and word-priority scheduling.

![Actual Milo selection popup rendered with demo data](docs/images/selection.png)
![Inline bilingual reading rendered with demo data](docs/images/bilingual.png)
![Local vocabulary notebook rendered with demo data](docs/images/notebook.png)

These images use the actual built UI with deterministic local fixtures, not private pages or live API responses. See [showcase reproduction](docs/showcase/README.md).

## Install

1. Download and extract the ZIP from [Releases](https://github.com/libuyi543-lang/milo-browser-extension/releases/latest).
2. Open `chrome://extensions`, enable Developer mode, and select **Load unpacked**.
3. Choose the extracted extension directory and open Milo from the toolbar.
4. Save your own DeepSeek API Key, open an English page, and select a word.

Chrome **128+** is required. This extension is not yet listed in the Chrome Web Store. Detailed instructions are in [the installation guide](docs/INSTALL.md).

## Privacy and costs

Keys and saved vocabulary stay in extension local storage. The key is accessible only to trusted extension contexts. Selected words or extracted English paragraphs are sent directly to DeepSeek for translation; saved titles, URLs and encounters are not proactively uploaded. API use is billed by DeepSeek; cancellation may still incur charges for an already submitted request.

Word translations are cached for 30 days, paragraph translations for 7 days, with a 500-entry / approximately 1 MB limit. Up to two network requests run concurrently. Identical in-flight requests share a result. See [privacy details](PRIVACY.md).

Uninstalling deletes local data. PDF, OCR, image/canvas text and cross-origin iframe paragraph translation are outside this release. For newly loaded feed content, restore the page and trigger translation again.

## Development

Use Node **16.20.2** and Yarn **1.22.22**, retained for compatibility with the inherited build system.

```sh
git clone https://github.com/libuyi543-lang/milo-browser-extension.git
cd milo-browser-extension
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --frozen-lockfile
yarn lint
yarn type-check
yarn test
yarn build
yarn package
```

Load `build/chrome` during development. ZIP packages are written to `dist/`. Reload the extension and refresh existing tabs after rebuilding.

React, TypeScript, RxJS selection and the Neutrino / Webpack infrastructure are retained from upstream. Chrome Manifest V3 is the current target. Legacy code remains in the repository but is excluded from the active Milo feature set. See [architecture](docs/MILO_V02.md) and [contributing](CONTRIBUTING.md).

## Roadmap

Mobile sync, accounts, incremental translation of newly loaded content, larger notebooks, export, contextual word explanations and provider selection are future work. They are not advertised as available features.

If Milo helps you keep a word you would otherwise forget, consider starring or sharing it. [Issues](https://github.com/libuyi543-lang/milo-browser-extension/issues) and contributions are welcome.

## License and attribution

Milo is an independent derivative of [Saladict](https://github.com/crimx/ext-saladict), created by CRIMX and contributors. The original MIT license and copyright are preserved in [LICENSE](LICENSE). See [NOTICE](NOTICE.md) and the upstream [trademark terms](TRADEMARKS.md). Milo is not an official Saladict release and is not endorsed by its maintainers.
