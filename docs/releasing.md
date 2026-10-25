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

The GitHub Actions workflow runs the same checks for pull requests and pushes to `main`. After it has completed successfully once, protect `main` with a branch ruleset that requires a pull request and the `CI / test` status check, and blocks force-pushes and branch deletion. For a single-maintainer project, avoid requiring an approving review unless another eligible reviewer is available; the pull request and passing CI still provide a deliberate merge gate. The repository's Dependabot configuration checks weekly for GitHub Actions updates so pinned action revisions can be refreshed.

For an automated npm release, prefer npm trusted publishing from a GitHub Actions workflow using OIDC instead of storing a long-lived npm publish token. npm can attach provenance automatically for public packages published from a public repository through a supported cloud CI runner. Restrict the workflow to reviewed release tags and use a protected GitHub environment if a human approval gate is wanted. Configure the trusted publisher on npm only when publication is approved; do not add a registry credential to the repository.

## Publication

After the release has been reviewed and publication is approved, publish the package with public access, tag the same version in Git, and create release notes that describe user-visible changes and the tested OpenCode/macOS versions. Publishing and creating the public release are separate actions from the local checks above. See npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/) guidance when setting up that workflow.
