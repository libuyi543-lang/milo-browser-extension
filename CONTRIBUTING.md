# Contributing to Milo

欢迎改进网页阅读、正文识别、语境提取和本地单词本。Please keep changes focused on reading and vocabulary capture.

## Start locally

Use Node 16.20.2 and Yarn 1.22.22. Clone this repository, run `yarn install --frozen-lockfile`, then `yarn build`. Load `build/chrome` in Chrome Developer mode. You do not need a real API key for the default tests.

Run `yarn lint`, `yarn type-check`, `yarn test`, `yarn build` and `yarn package` before submitting. For UI or selection changes, also check an ordinary article and an X page in Chrome. Refresh the page after reloading the extension.

## Current boundaries

- `src/content` / `src/selection`: selection, context and inline translation.
- `src/components/MiloWordPopup`: lightweight word UI.
- `src/background`: translation, caching, scheduling and local storage.
- `src/services`: UI-facing provider and storage interfaces.
- `src/models`: words and encounters.
- `src/popup/index.tsx`: current toolbar notebook and settings.

UI code should use service interfaces rather than directly reading credentials or writing storage. Preserve original text and links when injecting translations. Keep API keys in trusted extension contexts.

Many upstream sources are intentionally retained but are not built into Milo. Avoid deleting infrastructure without checking imports and build entries. The default test suite covers Milo; legacy tests may require downloaded fixtures.

## Pull requests

For a larger feature, open an issue describing the reading problem and proposed change first. Small fixes can go directly to a PR. Use conventional commit messages such as `fix: improve paragraph detection`. Explain behavior changes, testing and limitations; include screenshots for UI changes.

Do not commit API keys, private reading history, browser profiles, build outputs or dependency folders. Report sensitive issues using the guidance in [SECURITY.md](SECURITY.md).

Preserve [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and upstream attribution. Do not claim inherited source as original Milo code. Documentation and new product-facing interfaces should use the Milo name.
