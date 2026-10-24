"""Supervised, offline-only stdio worker for MLX Audio ASR models."""

from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
from typing import Any, TextIO

MAX_REQUEST_BYTES = 16_384
MAX_AUDIO_BYTES = 32 * 1024 * 1024
MAX_RESPONSE_BYTES = 1_000_000
BACKENDS = {"parakeet", "qwen3-asr"}
MODEL_TYPES = {"parakeet": "parakeet", "qwen3-asr": "qwen3_asr"}

# No Hub lookups, telemetry or model downloads are permitted during runtime.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def load_model(backend: str, model_path: str):
    if backend not in BACKENDS:
        raise ValueError(f"Unsupported ASR backend: {backend}")
    path = Path(model_path).expanduser().resolve()
    if not path.is_dir() or not any(path.iterdir()):
        raise FileNotFoundError(
            f"{backend} model assets are missing at {path}. Run the explicit setup command for {backend}."
        )
    with contextlib.redirect_stdout(sys.stderr):
        from mlx_audio.stt import load

        # Local model directories are named by their pinned HF revision hash.
        # MLX Audio otherwise treats that basename as the model type and fails
        # to resolve the actual architecture.
        return load(str(path), model_type=MODEL_TYPES[backend])


def transcribe_one(model: Any, backend: str, audio_path: str) -> str:
    if backend == "parakeet":
        result = model.generate(
            audio_path,
            chunk_duration=120.0,
            overlap_duration=15.0,
            verbose=False,
        )
    elif backend == "qwen3-asr":
        # A 15-minute recording fits into one Qwen chunk. Its generic chunk
        # merger concatenates chunk text without reconciling overlap tokens.
        result = model.generate(
            audio_path,
            chunk_duration=1200.0,
            min_chunk_duration=1.0,
            temperature=0.0,
            verbose=False,
        )
    else:
        raise ValueError(f"Unsupported ASR backend: {backend}")
    text = getattr(result, "text", None)
    if not isinstance(text, str):
        raise TypeError("ASR model returned no transcript text")
    return text.strip()


def validate_request(value: Any) -> tuple[str | int, str]:
    if not isinstance(value, dict):
        raise ValueError("Request must be a JSON object")
    request_id = value.get("id")
    if not isinstance(request_id, (str, int)) or isinstance(request_id, bool):
        raise ValueError("Request must include a string or integer id")
    if isinstance(request_id, str) and (not request_id or len(request_id) > 128):
        raise ValueError("Request id must contain 1 to 128 characters")
    audio_path = value.get("path")
    if not isinstance(audio_path, str) or not audio_path:
        raise ValueError("Request must include an audio path")
    path = Path(audio_path).resolve(strict=True)
    if not path.is_file():
        raise ValueError("Audio path is not a regular file")
    if path.stat().st_size > MAX_AUDIO_BYTES:
        raise ValueError("Audio file exceeds the 15-minute PCM limit")
    return request_id, str(path)


def send(writer: TextIO, value: dict[str, Any]) -> None:
    line = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(line.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise ValueError("Worker response exceeds the 1 MB protocol limit")
    writer.write(line + "\n")
    writer.flush()


def serve(reader: TextIO, writer: TextIO, model: Any, backend: str) -> None:
    while True:
        line = reader.readline(MAX_REQUEST_BYTES + 1)
        if not line:
            return
        if len(line.encode("utf-8")) > MAX_REQUEST_BYTES or not line.endswith("\n"):
            while line and not line.endswith("\n"):
                line = reader.readline(MAX_REQUEST_BYTES + 1)
            send(writer, {"type": "error", "id": None, "message": "Request exceeds the 16 KB protocol limit"})
            continue
        request_id: str | int | None = None
        try:
            request = json.loads(line)
            if isinstance(request, dict):
                candidate_id = request.get("id")
                if isinstance(candidate_id, (str, int)) and not isinstance(candidate_id, bool):
                    request_id = candidate_id
            request_id, audio_path = validate_request(request)
            started = time.monotonic()
            with contextlib.redirect_stdout(sys.stderr):
                text = transcribe_one(model, backend, audio_path)
            send(writer, {
                "type": "result",
                "id": request_id,
                "text": text,
                "durationMs": round((time.monotonic() - started) * 1000),
            })
        except Exception as error:  # One bad request must not wedge the worker.
            send(writer, {"type": "error", "id": request_id, "message": str(error)[:2000]})


def watch_parent() -> None:
    """Terminate even during native inference if the supervising plugin dies."""
    parent = os.getppid()
    while True:
        time.sleep(0.25)
        if os.getppid() != parent or os.getppid() == 1:
            os.kill(os.getpid(), signal.SIGTERM)
            return


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: transcribe.py BACKEND LOCAL_MODEL_DIRECTORY", file=sys.stderr)
        return 2
    backend, model_path = sys.argv[1:]
    if backend not in BACKENDS:
        print(f"Unsupported ASR backend: {backend}", file=sys.stderr)
        return 2
    try:
        model = load_model(backend, model_path)
    except Exception as error:
        print(f"Could not load {backend} model: {error}", file=sys.stderr)
        return 1
    wire = sys.stdout
    threading.Thread(target=watch_parent, name="dictate-parent-watch", daemon=True).start()
    send(wire, {"type": "ready", "backend": backend})
    serve(sys.stdin, wire, model, backend)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
