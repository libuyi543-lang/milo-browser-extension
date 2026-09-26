# Security

Never include API keys, private page contents, browser profiles or complete storage dumps in issues or pull requests. Reproduce bugs with a public page or a small synthetic fixture.

For a sensitive vulnerability, use GitHub's private vulnerability reporting on this repository. Do not publish credential extraction details in a public issue before a fix is available. If a key was exposed, revoke or rotate it in the provider console.

The current supported release is 0.3.1. The inherited build chain uses Node 16 and older dependencies; modernization is planned. Run it as a development toolchain, not a public server. The runtime credential boundary, data sent to the selected AI provider and storage behavior are documented in [PRIVACY.md](PRIVACY.md).
