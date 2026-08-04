import inspect
import sys
from types import ModuleType
from uuid import UUID

import pytest

from backend import main


class FakeCuda:
    def __init__(self, *, available=True, count=1, names=None):
        self._available = available
        self._count = count
        self._names = names or ["NVIDIA L4"]

    def is_available(self):
        return self._available

    def device_count(self):
        return self._count

    def get_device_name(self, index):
        return self._names[index]


class FakeParam:
    def __init__(self, device):
        self.device = device


class FakeInnerModel:
    def __init__(self, outer):
        self.outer = outer

    def parameters(self):
        return iter([FakeParam(self.outer.device)])


class FakeYolo:
    def __init__(self, _path):
        self.device = "cpu"
        self.model = FakeInnerModel(self)
        self.to_calls = []

    def to(self, device):
        self.device = device
        self.to_calls.append(device)
        return self


class FakePath:
    def exists(self):
        return True

    def __str__(self):
        return "/app/models/best.pt"


@pytest.fixture(autouse=True)
def reset_model(monkeypatch):
    monkeypatch.setattr(main, "model", None)
    monkeypatch.setattr(main, "model_device_effective", None)
    monkeypatch.setattr(main, "YOLO", FakeYolo)
    monkeypatch.setattr(main, "MODEL_PATH", FakePath())


def install_torch(monkeypatch, *, available=True, count=1, names=None):
    torch = ModuleType("torch")
    torch.cuda = FakeCuda(available=available, count=count, names=names)
    torch.__version__ = "2.5.1+cu121"
    monkeypatch.setitem(sys.modules, "torch", torch)
    return torch


def test_default_model_device_is_cpu(monkeypatch):
    install_torch(monkeypatch, available=False, count=0)
    monkeypatch.setattr(main, "MODEL_DEVICE", "cpu")

    model = main.get_model()

    assert model.to_calls == ["cpu"]
    assert main.model_device_effective == "cpu"


def test_cuda_requires_available_cuda(monkeypatch):
    install_torch(monkeypatch, available=False, count=0)
    monkeypatch.setattr(main, "MODEL_DEVICE", "cuda:0")

    with pytest.raises(RuntimeError, match="torch.cuda.is_available"):
        main.get_model()


def test_invalid_cuda_device_index_fails(monkeypatch):
    install_torch(monkeypatch, available=True, count=1)
    monkeypatch.setattr(main, "MODEL_DEVICE", "cuda:1")

    with pytest.raises(RuntimeError, match="only 1 CUDA device"):
        main.get_model()


def test_model_moves_to_requested_cuda_device(monkeypatch):
    install_torch(monkeypatch, available=True, count=2, names=["NVIDIA L4", "NVIDIA L4"])
    monkeypatch.setattr(main, "MODEL_DEVICE", "cuda:0")

    model = main.get_model()

    assert model.to_calls == ["cuda:0"]
    assert main.model_device_effective == "cuda:0"


def test_mp4_track_call_receives_model_device():
    source = inspect.getsource(main._process_video_drive_file)

    assert "device=MODEL_DEVICE" in source
    assert "half=" not in source


def test_worker_cuda_preflight_fails_before_claim(monkeypatch):
    install_torch(monkeypatch, available=False, count=0)
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "MODEL_DEVICE", "cuda:0")
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.test")
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    monkeypatch.setattr(main, "_claim_processing_job", lambda *_args: (_ for _ in ()).throw(AssertionError("claim must not run")))

    with pytest.raises(RuntimeError, match="torch.cuda.is_available"):
        main.process_internal_job(main.WorkerJobInput(job_id=UUID("55555555-5555-4555-8555-555555555555")))


def test_health_gpu_diagnostics_do_not_expose_secrets(monkeypatch):
    install_torch(monkeypatch, available=True, count=1, names=["NVIDIA L4 <secret>"])
    monkeypatch.setattr(main, "MODEL_DEVICE", "cuda:0")

    response = main.health_check()

    assert response["model_device_requested"] == "cuda:0"
    assert response["cuda_available"] is True
    assert response["cuda_device_count"] == 1
    assert response["cuda_device_name"] == "NVIDIA L4 secret"
    assert response["model_loaded"] is True
    assert response["model_device_effective"] == "cuda:0"
    text = repr(response)
    assert "SERVICE_ROLE_KEY" not in text
    assert "GOOGLE_REFRESH_TOKEN" not in text
    assert "test-service-role" not in text


def test_production_worker_contract_sources_remain_present():
    process_source = inspect.getsource(main.process_internal_job)
    job_source = inspect.getsource(main._process_job)
    completion_source = inspect.getsource(main._complete_processing_job)

    assert '@app.post("/internal/jobs/process")' in inspect.getsource(main)
    assert "_claim_processing_job" in process_source
    assert "already_completed" in process_source
    assert "PROCESSED_DRIVE_FILES_TABLE" in job_source
    assert "_download_drive_file" in inspect.getsource(main._process_drive_file)
    assert "lease_expires_at=None" in completion_source
