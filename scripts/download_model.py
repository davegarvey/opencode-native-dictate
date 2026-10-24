"""Download one explicitly selected, revision-pinned ASR model."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: download_model.py BACKEND MODELS_DIRECTORY", file=sys.stderr)
        return 2
    backend, models_directory = sys.argv[1:]
    config_path = Path(__file__).resolve().parents[1] / "config" / "models.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))["models"]
    model = config.get(backend)
    if model is None:
        print(f"Unsupported model backend: {backend}", file=sys.stderr)
        return 2

    destination = Path(models_directory).expanduser().resolve() / backend / model["revision"]
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destination.parent, 0o700)
    os.chmod(destination, 0o700)
    manifest_path = destination / ".dictate-model.json"
    expected = {"backend": backend, "repo": model["repo"], "revision": model["revision"]}
    if manifest_path.exists() and json.loads(manifest_path.read_text(encoding="utf-8")) == expected:
        if (destination / "config.json").is_file() and any(destination.glob("*.safetensors")):
            print(json.dumps({"type": "ready", "backend": backend, "path": str(destination)}))
            return 0

    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=model["repo"],
            revision=model["revision"],
            local_dir=str(destination),
        )
    except Exception as error:
        print(f"Model download failed: {error}", file=sys.stderr)
        return 1

    if not (destination / "config.json").is_file() or not any(destination.glob("*.safetensors")):
        print("Downloaded model is incomplete: config.json or safetensors weights are missing.", file=sys.stderr)
        return 1
    temporary_manifest = manifest_path.with_suffix(".json.tmp")
    temporary_manifest.write_text(json.dumps(expected, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary_manifest, 0o600)
    os.replace(temporary_manifest, manifest_path)
    print(json.dumps({"type": "ready", "backend": backend, "path": str(destination)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
