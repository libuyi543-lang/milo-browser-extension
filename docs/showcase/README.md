# Reproduce Milo showcase images

The renderer loads the real `build/chrome` content and toolbar bundles. Browser messaging is replaced **only inside this local demo** with deterministic public fixtures. Translation and save states are real UI renderings; no live DeepSeek request or private browser profile is used. This fixture harness is not included in the distributed extension.

1. Build the extension with the documented Node 16 toolchain.
2. Provide Playwright in a separate Node 18+ environment (do not modify the extension lockfile). Chrome must be installed, or Playwright Chromium must be downloaded.
3. Run `node scripts/render-showcase.js`. If Playwright is installed outside this project, set `MILO_PLAYWRIGHT_MODULE` to its module directory. Set `MILO_CHROME_PATH` to a Chrome executable if the platform default does not work.

Generated files are placed in `docs/images`. The demo server binds only to `127.0.0.1` on a temporary port and closes after capture. The script checks the popup meaning, saved state, inline translation, encounter count, provider switching and API settings save/test states before taking images.

`demo.html` is the reading fixture; `fixture.js` replaces background responses using sample words. `cover.html` composes the existing icon and UI captures into a shareable cover. These UI graphics are rendered from HTML/CSS and the extension's real bundles, not AI-generated screenshots.

The mascot icon was prepared earlier with the built-in image editing tool from the user-provided artwork. The retained icon edit prompt is in `icon-edit-prompt.txt`.
