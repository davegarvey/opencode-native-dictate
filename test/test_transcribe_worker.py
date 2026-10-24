import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from types import SimpleNamespace
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "transcribe.py"
SPEC = importlib.util.spec_from_file_location("dictate_transcribe_worker", SCRIPT)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class FakeModel:
    def __init__(self, text="captured test speech"):
        self.text = text
        self.calls = []

    def generate(self, path, **kwargs):
        self.calls.append((path, kwargs))
        return SimpleNamespace(text=self.text)


class WorkerProtocolTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.audio = Path(self.directory.name) / "probe.wav"
        self.audio.write_bytes(b"test fixture")

    def tearDown(self):
        self.directory.cleanup()

    def test_parakeet_adapter_uses_native_overlap_reconciliation(self):
        model = FakeModel("  hello from parakeet  ")
        text = worker.transcribe_one(model, "parakeet", str(self.audio))
        self.assertEqual(text, "hello from parakeet")
        self.assertEqual(model.calls[0][1], {
            "chunk_duration": 120.0,
            "overlap_duration": 15.0,
            "verbose": False,
        })

    def test_qwen_adapter_uses_one_chunk_for_the_recording_limit(self):
        model = FakeModel()
        worker.transcribe_one(model, "qwen3-asr", str(self.audio))
        self.assertEqual(model.calls[0][1]["chunk_duration"], 1200.0)
        self.assertEqual(model.calls[0][1]["temperature"], 0.0)

    def test_protocol_matches_request_ids_and_keeps_worker_alive_after_errors(self):
        model = FakeModel()
        lines = [
            json.dumps({"id": "bad-path", "path": str(self.audio) + ".missing"}) + "\n",
            json.dumps({"id": 42, "path": str(self.audio)}) + "\n",
        ]
        output = io.StringIO()
        worker.serve(io.StringIO("".join(lines)), output, model, "parakeet")
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(messages[0]["type"], "error")
        self.assertEqual(messages[0]["id"], "bad-path")
        self.assertEqual(messages[1]["type"], "result")
        self.assertEqual(messages[1]["id"], 42)
        self.assertEqual(messages[1]["text"], "captured test speech")

    def test_oversized_request_is_discarded_as_one_message(self):
        model = FakeModel()
        oversized = " " * (worker.MAX_REQUEST_BYTES + 5) + "\n"
        valid = json.dumps({"id": 7, "path": str(self.audio)}) + "\n"
        output = io.StringIO()
        worker.serve(io.StringIO(oversized + valid), output, model, "parakeet")
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([message["type"] for message in messages], ["error", "result"])
        self.assertEqual(messages[1]["id"], 7)

    def test_missing_local_model_fails_without_importing_or_downloading(self):
        with self.assertRaisesRegex(FileNotFoundError, "explicit setup command"):
            worker.load_model("parakeet", str(Path(self.directory.name) / "missing"))

    def test_loader_receives_model_type_instead_of_revision_directory_name(self):
        stt = ModuleType("mlx_audio.stt")
        stt.load = mock.Mock(return_value="loaded model")
        mlx_audio = ModuleType("mlx_audio")
        mlx_audio.stt = stt
        with mock.patch.dict(sys.modules, {"mlx_audio": mlx_audio, "mlx_audio.stt": stt}):
            for backend, model_type in (("parakeet", "parakeet"), ("qwen3-asr", "qwen3_asr")):
                model_dir = Path(self.directory.name) / ("ed2b7e8c15f9" if backend == "parakeet" else "89e96d92ba34")
                model_dir.mkdir()
                (model_dir / "config.json").write_text("{}", encoding="utf-8")
                self.assertEqual(worker.load_model(backend, str(model_dir)), "loaded model")
                stt.load.assert_called_with(str(model_dir.resolve()), model_type=model_type)
                stt.load.reset_mock()

    def test_parent_watcher_terminates_worker_when_supervisor_disappears(self):
        terminated = SystemExit("worker terminated")
        with mock.patch.object(worker.os, "getppid", side_effect=[123, 1]), \
             mock.patch.object(worker.time, "sleep"), \
             mock.patch.object(worker.os, "kill", side_effect=terminated) as kill:
            with self.assertRaisesRegex(SystemExit, "worker terminated"):
                worker.watch_parent()
        kill.assert_called_once_with(worker.os.getpid(), worker.signal.SIGTERM)


if __name__ == "__main__":
    unittest.main()
