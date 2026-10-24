import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "download_model.py"
SPEC = importlib.util.spec_from_file_location("dictate_download_model", SCRIPT)
downloader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(downloader)


class ModelDownloadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.models = Path(self.directory.name) / "models"
        self.model = downloader.json.loads((Path(__file__).resolve().parents[1] / "config/models.json").read_text())["models"]["parakeet"]
        self.destination = self.models / "parakeet" / self.model["revision"]

    def tearDown(self):
        self.directory.cleanup()

    def run_download(self, snapshot):
        hub = types.ModuleType("huggingface_hub")
        hub.snapshot_download = snapshot
        stdout = io.StringIO()
        with mock.patch.dict(sys.modules, {"huggingface_hub": hub}), \
             mock.patch.object(sys, "argv", [str(SCRIPT), "parakeet", str(self.models)]), \
             contextlib.redirect_stdout(stdout):
            result = downloader.main()
        return result, stdout.getvalue()

    def test_complete_download_writes_integrity_marker_and_rerun_reuses_it(self):
        calls = []

        def snapshot_download(**kwargs):
            calls.append(kwargs)
            target = Path(kwargs["local_dir"])
            (target / "config.json").write_text("{}")
            (target / "weights.safetensors").write_bytes(b"model")

        result, output = self.run_download(snapshot_download)
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["revision"], self.model["revision"])
        marker = json.loads((self.destination / ".dictate-model.json").read_text())
        self.assertEqual(marker["repo"], self.model["repo"])
        self.assertEqual(json.loads(output)["type"], "ready")
        self.assertEqual(os.stat(self.destination).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(self.destination / ".dictate-model.json").st_mode & 0o777, 0o600)

        result, _ = self.run_download(lambda **kwargs: self.fail("complete pinned assets should not redownload"))
        self.assertEqual(result, 0)

    def test_interrupted_download_does_not_mark_partial_assets_complete(self):
        def fail_partway(**kwargs):
            target = Path(kwargs["local_dir"])
            (target / "partial.bin").write_bytes(b"partial")
            raise OSError("interrupted download")

        result, _ = self.run_download(fail_partway)
        self.assertEqual(result, 1)
        self.assertFalse((self.destination / ".dictate-model.json").exists())

        def resume(**kwargs):
            target = Path(kwargs["local_dir"])
            (target / "config.json").write_text("{}")
            (target / "weights.safetensors").write_bytes(b"complete")

        result, _ = self.run_download(resume)
        self.assertEqual(result, 0)
        self.assertTrue((self.destination / ".dictate-model.json").is_file())


if __name__ == "__main__":
    unittest.main()
