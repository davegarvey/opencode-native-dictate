# Release process

The npm package version in `package.json` is the release version. Keep the root `package-lock.json`, README install example, and OpenCode compatibility target in sync with it. Pin an exact npm version in `cli.json` so an OpenCode startup cannot silently move users to an unreviewed build.

While the package remains below `1.0.0`, use patch versions for fixes and minor versions for new features. Update the version only after the changes are reviewed and the release checks below pass.

## Local release checks

Run these on an Apple Silicon Mac with the supported OpenCode version:

```sh
npm ci
npm run check
npm test
npm pack --dry-run --json
```

Inspect the package file list for secrets, absolute local paths, recordings, model weights, generated binaries, and development-only files. Install that exact tarball in a clean OpenCode profile, run setup and doctor, then verify recording, cancellation, transcription, cursor insertion, and offline operation in Ghostty. Record manual results in `docs/acceptance-results.md`.

The package lifecycle builds only the JavaScript TUI entrypoint. It does not compile the native recorder or download dependencies/models during package installation. The explicit `native-dictate setup` command builds the recorder and installs the pinned local runtime/model into Application Support.

`npm publish` runs the type check and full automated suite through `prepublishOnly`. That gate does not replace the manual Ghostty checks above.

## Repository safeguards

The GitHub Actions workflow runs checks for pull requests and pushes to `main`, on Node 24 and the declared minimum Node 20. The active `main` ruleset requires a pull request and both the `test` and `node-20-compatibility` status checks, and blocks force-pushes and branch deletion. For a single-maintainer project, avoid requiring an approving review unless another eligible reviewer is available; the pull request and passing CI still provide a deliberate merge gate. The repository's Dependabot configuration checks weekly for GitHub Actions, npm, and Python `uv` updates.

For automated npm releases, this repository uses npm trusted publishing from `.github/workflows/publish.yml`. The workflow runs when a GitHub Release is published, requires a matching `v<package-version>` tag reachable from `main`, repeats the package and security checks, and publishes through GitHub Actions OIDC. npm automatically attaches provenance for this public repository. No npm publish token is stored in GitHub.

npm requires the package to exist before its trusted publisher can be configured. The first version therefore needs a one-time authenticated publish from a maintainer's Mac after the account has npm publishing access. Then, in that package's npm settings, add a GitHub Actions trusted publisher for `davegarvey/opencode-native-dictate` and the workflow filename `publish.yml`, allowing `npm publish`. Do not put the npm password or token in the repository. When the matching GitHub Release is created, the workflow verifies the tag and package version; it safely skips publishing if that exact version is already on npm. Future releases publish from GitHub Actions with OIDC.

The release workflow uses a GitHub-hosted macOS runner because the automated test suite includes Swift and macOS-native checks. Keep the workflow's npm CLI at a version that supports trusted publishing (npm 11.5.1 or newer); Node 24 currently supplies a compatible npm version. The workflow disables dependency caching and grants only the read access and OIDC identity required for a release.

## Publication

For the bootstrap release, update the changelog from `Unreleased`, run the local release checks, and publish the exact package version from an authenticated maintainer session. Then configure npm trusted publishing and create the matching GitHub Release with notes describing user-visible changes and the tested OpenCode/macOS versions. For later releases, update the package version, lockfile, README examples and changelog on `main`, then create the matching GitHub Release; the workflow performs the CI checks and publication. See npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/) guidance.
