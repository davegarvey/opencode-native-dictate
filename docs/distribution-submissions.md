# Directory listing drafts

These are submission materials only. They do not submit or publish anything. Use them after the npm package and install flow have passed a clean-machine check.

## OpenDock

OpenDock indexes npm packages automatically during its daily sync. The package metadata now includes the required `opencode-plugin` keyword. No manual listing or pull request is needed; listing starts only after an npm publication.

Suggested description: **Offline macOS voice dictation for OpenCode, powered by NVIDIA Parakeet.**

## Awesome OpenCode

The current contribution process uses one YAML file under `data/plugins/`, not a README edit. Suggested `data/plugins/opencode-native-dictate.yaml`:

```yaml
name: OpenCode Native Dictate
repo: https://github.com/davegarvey/opencode-native-dictate
tagline: Offline macOS voice dictation for OpenCode with NVIDIA Parakeet
description: Records speech locally on Apple Silicon, transcribes with NVIDIA Parakeet, and inserts the result at the OpenCode prompt cursor without submitting it.
```

The repository must be public, maintained, relevant, unique, and have every required field before submission. Open a PR after the source repository is public and the package/install flow has passed a clean-machine check.

## Official OpenCode ecosystem

The official ecosystem page asks contributors to submit a pull request to the OpenCode repository. Suggested row for the Plugins table:

```markdown
| [opencode-native-dictate](https://github.com/davegarvey/opencode-native-dictate) | Offline macOS voice dictation for OpenCode, powered by NVIDIA Parakeet |
```

The OpenCode docs page's **Edit page** link targets `packages/web/src/content/docs/ecosystem.mdx` in the OpenCode repository. Submit the prepared table row as a PR after the source repository is public and the package/install flow has passed a clean-machine check.

## Nearby plugins

The closest match found during this review is [panoptek/opencode-dictation](https://github.com/panoptek/opencode-dictation). It provides local Whisper dictation in OpenCode, with a visible recording meter and cursor insertion, and targets GPU systems such as NVIDIA RTX. Native Dictate is narrower: Apple Silicon macOS, Parakeet by default (optional Qwen3-ASR), with Ghostty as its main tested terminal. The reviewed results did not reveal another OpenCode plugin that combines Parakeet, macOS-native capture and the same local-first prompt workflow. This is a search result, not an exhaustive count.
