import inspect
import json
import sys
import types
from types import SimpleNamespace
from pathlib import Path
from uuid import UUID

import pytest
from fastapi import HTTPException

from backend import main


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeDatabase:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.calls = []
        self.client = object()

    def execute(self, operation, recover=None):
        self.calls.append(operation)
        return operation(FakeClient(self.rows))


class FakeClient:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return FakeTable(self.rows.setdefault(name, []))

    def rpc(self, name, params):
        return FakeRpc(self.rows, name, params)


class FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.payload = None
        self.operation = "select"
        self.single = False

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        if self.operation == "insert":
            row = dict(self.payload)
            row.setdefault("id", "55555555-5555-4555-8555-555555555555")
            self.rows.append(row)
            return FakeResponse([row])
        selected = [row for row in self.rows if all(row.get(key) == value for key, value in self.filters)]
        if self.operation == "update":
            for row in selected:
                row.update(self.payload)
            return FakeResponse(selected)
        return FakeResponse(selected[0] if self.single and selected else (None if self.single else selected))


class FakeRpc:
    def __init__(self, rows, name, params):
        self.rows = rows
        self.name = name
        self.params = params

    def execute(self):
        if self.name != "claim_processing_job":
            raise AssertionError(self.name)
        return FakeResponse([{"claimed": True, "status": "processing"}])


def principal(user_id="11111111-1111-4111-8111-111111111111"):
    return main.Principal("user", user_id, frozenset({"scan:write", "job:read"}), profile_id="22222222-2222-4222-8222-222222222222")


def test_upload_start_creates_supabase_session_without_returning_drive_url(monkeypatch):
    rows = {main.UPLOAD_SESSIONS_TABLE: []}
    monkeypatch.setattr(main, "scan_user_id", lambda *_args, **_kwargs: "22222222-2222-4222-8222-222222222222")

    session = main._insert_upload_session(
        FakeDatabase(rows),
        principal(),
        upload_id="33333333-3333-4333-8333-333333333333",
        filename="scan.mp4",
        mime="video/mp4",
        size_bytes=1234,
        upload_url="https://upload.example.test/session",
    )
    response = main._upload_session_response(session)

    assert rows[main.UPLOAD_SESSIONS_TABLE][0]["drive_resumable_url"] == "https://upload.example.test/session"
    assert rows[main.UPLOAD_SESSIONS_TABLE][0]["owner_auth_user_id"] == principal().id
    assert "drive_resumable_url" not in response


def test_second_application_instance_can_read_upload_session():
    rows = {
        main.UPLOAD_SESSIONS_TABLE: [{
            "id": "33333333-3333-4333-8333-333333333333",
            "owner_auth_user_id": principal().id,
            "status": "upload_pending",
            "drive_resumable_url": "https://upload.example.test/session",
        }]
    }

    loaded = main._load_upload_session(FakeDatabase(rows), "33333333-3333-4333-8333-333333333333", principal())

    assert loaded["drive_resumable_url"] == "https://upload.example.test/session"


def test_unauthorized_user_cannot_read_another_upload_session():
    rows = {
        main.UPLOAD_SESSIONS_TABLE: [{
            "id": "33333333-3333-4333-8333-333333333333",
            "owner_auth_user_id": principal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").id,
            "status": "upload_pending",
        }]
    }

    loaded = main._load_upload_session(FakeDatabase(rows), "33333333-3333-4333-8333-333333333333", principal())

    assert loaded is None


def test_no_process_memory_upload_session_dependency():
    assert not hasattr(main, "UPLOAD_SESSIONS")


def test_content_range_progress_is_parsed_for_atomic_max_update():
    assert main._content_range_end("bytes 0-1048575/2097152") == 1048576
    assert main._content_range_end("bad") is None


def test_ingest_creates_one_job_and_one_task(monkeypatch):
    rows = {main.JOBS_TABLE: []}
    tasks = []
    monkeypatch.setattr(main, "supabase", object())
    monkeypatch.setattr(main, "PROCESSING_BACKEND", "cloud-tasks")
    monkeypatch.setattr(main, "_verify_completed_upload_for_drive_file", lambda *_args: None)
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "enqueue_processing_task", lambda job_id: tasks.append({"job_id": job_id}) or {"task_name": f"task/{job_id}", "duplicate": False})

    response = main.ingest(main.IngestInput(source="drive_file", ref="drive-1", options={}), principal())

    assert response["status"] == "queued"
    assert response["task_dispatched"] is True
    assert len(rows[main.JOBS_TABLE]) == 1
    assert tasks == [{"job_id": response["job_id"]}]


def test_ingest_duplicate_task_name_is_idempotent(monkeypatch):
    rows = {main.JOBS_TABLE: []}
    monkeypatch.setattr(main, "supabase", object())
    monkeypatch.setattr(main, "PROCESSING_BACKEND", "cloud-tasks")
    monkeypatch.setattr(main, "_verify_completed_upload_for_drive_file", lambda *_args: None)
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "enqueue_processing_task", lambda job_id: {"task_name": f"task/{job_id}", "duplicate": True})

    response = main.ingest(main.IngestInput(source="drive_file", ref="drive-1", options={}), principal())

    assert response["task_duplicate"] is True


def test_task_payload_contains_job_id_only():
    source = inspect.getsource(main.enqueue_processing_task)

    assert 'json.dumps({"job_id": job_id}' in source
    assert "SUPABASE_SERVICE_ROLE_KEY" not in source
    assert "GOOGLE_REFRESH_TOKEN" not in source
    assert "drive_resumable_url" not in source


def test_health_includes_safe_deployment_identity(monkeypatch):
    monkeypatch.setenv("APP_COMMIT_SHA", "422f2553831597342015f8e201b420c64414b626")
    monkeypatch.setenv("K_SERVICE", "purityloop-worker")
    monkeypatch.setenv("K_REVISION", "purityloop-worker-00042-abc")
    monkeypatch.setenv("IMAGE_TAG", "purityloop-backend:422f255")
    monkeypatch.setenv("IMAGE_DIGEST", "sha256:abc123")
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")

    payload = main.health()

    assert payload["app_commit_sha"] == "422f2553831597342015f8e201b420c64414b626"
    assert payload["cloud_run_service"] == "purityloop-worker"
    assert payload["cloud_run_revision"] == "purityloop-worker-00042-abc"
    assert payload["service_mode"] == "worker"
    assert payload["image_tag"] == "purityloop-backend:422f255"
    assert payload["image_digest"] == "sha256:abc123"
    assert "SUPABASE_SERVICE_ROLE_KEY" not in json.dumps(payload)


def test_worker_build_revision_prefers_app_commit_sha(monkeypatch):
    monkeypatch.setenv("APP_COMMIT_SHA", "422f2553831597342015f8e201b420c64414b626")
    monkeypatch.setenv("K_REVISION", "purityloop-worker-00001-old")

    assert main._worker_build_revision() == "422f2553831597342015f8e201b420c64414b626"


class FakeTasksClient:
    def __init__(self):
        self.created_request = None

    def queue_path(self, project, location, queue):
        return f"projects/{project}/locations/{location}/queues/{queue}"

    def task_path(self, project, location, queue, task):
        return f"projects/{project}/locations/{location}/queues/{queue}/tasks/{task}"

    def create_task(self, request):
        self.created_request = request
        return SimpleNamespace(name=request["task"]["name"])


def configure_cloud_task(monkeypatch, fake_client, *, audience="https://purityloop-worker-cqthaeqncq-as.a.run.app"):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(main, "CLOUD_TASKS_PROJECT_ID", "capstone-1-501600")
    monkeypatch.setattr(main, "CLOUD_TASKS_LOCATION", "asia-southeast1")
    monkeypatch.setattr(main, "CLOUD_TASKS_QUEUE", "purityloop-mp4-processing")
    monkeypatch.setattr(main, "CLOUD_TASKS_WORKER_URL", "https://purityloop-worker-cqthaeqncq-as.a.run.app/internal/jobs/process")
    monkeypatch.setattr(main, "CLOUD_TASKS_OIDC_AUDIENCE", audience)
    monkeypatch.setattr(main, "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT", "purityloop-tasks-caller@capstone-1-501600.iam.gserviceaccount.com")

    exceptions_module = types.ModuleType("google.api_core.exceptions")
    exceptions_module.AlreadyExists = type("AlreadyExists", (Exception,), {})
    tasks_module = types.ModuleType("google.cloud.tasks_v2")
    tasks_module.CloudTasksClient = lambda: fake_client
    tasks_module.HttpMethod = SimpleNamespace(POST="POST")
    monkeypatch.setitem(sys.modules, "google.api_core.exceptions", exceptions_module)
    monkeypatch.setitem(sys.modules, "google.cloud.tasks_v2", tasks_module)
    try:
        import google.cloud
    except ImportError:
        cloud_module = types.ModuleType("google.cloud")
        monkeypatch.setitem(sys.modules, "google.cloud", cloud_module)
    else:
        cloud_module = google.cloud
    monkeypatch.setattr(cloud_module, "tasks_v2", tasks_module, raising=False)


def test_cloud_task_uses_handler_url_worker_audience_payload_and_caller(monkeypatch):
    fake_client = FakeTasksClient()
    configure_cloud_task(monkeypatch, fake_client)

    main.enqueue_processing_task("55555555-5555-4555-8555-555555555555")

    task = fake_client.created_request["task"]
    http_request = task["http_request"]
    oidc_token = http_request["oidc_token"]
    assert http_request["http_method"] == "POST"
    assert http_request["url"] == "https://purityloop-worker-cqthaeqncq-as.a.run.app/internal/jobs/process"
    assert json.loads(http_request["body"].decode("utf-8")) == {"job_id": "55555555-5555-4555-8555-555555555555"}
    assert oidc_token["service_account_email"] == "purityloop-tasks-caller@capstone-1-501600.iam.gserviceaccount.com"
    assert oidc_token["audience"] == "https://purityloop-worker-cqthaeqncq-as.a.run.app"
    assert "/internal/jobs/process" not in oidc_token["audience"]


def test_cloud_task_rejects_missing_oidc_audience_in_production(monkeypatch):
    fake_client = FakeTasksClient()
    configure_cloud_task(monkeypatch, fake_client, audience=None)

    with pytest.raises(RuntimeError, match="oidc_audience"):
        main.enqueue_processing_task("55555555-5555-4555-8555-555555555555")


@pytest.mark.parametrize(
    "audience",
    [
        "https://purityloop-worker-cqthaeqncq-as.a.run.app/internal/jobs/process",
        "https://purityloop-worker-cqthaeqncq-as.a.run.app?x=1",
        "https://purityloop-worker-cqthaeqncq-as.a.run.app#fragment",
        "http://purityloop-worker-cqthaeqncq-as.a.run.app",
        "*",
        "https://localhost",
        "https://127.0.0.1",
    ],
)
def test_production_oidc_audience_rejects_unsafe_values(monkeypatch, audience):
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(RuntimeError):
        main._normalize_cloud_tasks_oidc_audience(audience)


def test_cloud_task_oidc_audience_trailing_slash_is_normalized(monkeypatch):
    fake_client = FakeTasksClient()
    configure_cloud_task(monkeypatch, fake_client, audience="https://purityloop-worker-cqthaeqncq-as.a.run.app/")

    main.enqueue_processing_task("55555555-5555-4555-8555-555555555555")

    oidc_token = fake_client.created_request["task"]["http_request"]["oidc_token"]
    assert oidc_token["audience"] == "https://purityloop-worker-cqthaeqncq-as.a.run.app"


def test_worker_mode_startup_does_not_require_cloud_tasks_producer_config(monkeypatch):
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "CLOUD_TASKS_PROJECT_ID", None)
    monkeypatch.setattr(main, "CLOUD_TASKS_LOCATION", None)
    monkeypatch.setattr(main, "CLOUD_TASKS_QUEUE", None)
    monkeypatch.setattr(main, "CLOUD_TASKS_WORKER_URL", None)
    monkeypatch.setattr(main, "CLOUD_TASKS_OIDC_AUDIENCE", None)
    monkeypatch.setattr(main, "CLOUD_TASKS_CALLER_SERVICE_ACCOUNT", None)

    main.start_worker()


def test_task_creation_failure_records_dispatch_error(monkeypatch):
    rows = {main.JOBS_TABLE: []}
    monkeypatch.setattr(main, "supabase", object())
    monkeypatch.setattr(main, "PROCESSING_BACKEND", "cloud-tasks")
    monkeypatch.setattr(main, "_verify_completed_upload_for_drive_file", lambda *_args: None)
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "enqueue_processing_task", lambda _job_id: (_ for _ in ()).throw(RuntimeError("task api down")))

    try:
        main.ingest(main.IngestInput(source="drive_file", ref="drive-1", options={}), principal())
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("expected HTTPException")

    assert rows[main.JOBS_TABLE][0]["dispatch_error"] == "task api down"


def test_worker_endpoint_processes_claimed_job(monkeypatch):
    job_id = "55555555-5555-4555-8555-555555555555"
    rows = {main.JOBS_TABLE: [{"id": job_id, "source": "drive_file", "source_ref": "drive-1"}]}
    updates = []
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "_claim_processing_job", lambda *_args: {"claimed": True, "status": "processing"})
    monkeypatch.setattr(main, "_process_job", lambda *_args: ["scan-1"])
    monkeypatch.setattr(main, "_update_job", lambda *args, **kwargs: updates.append((args, kwargs)))

    response = main.process_internal_job(main.WorkerJobInput(job_id=UUID(job_id)))

    assert response["status"] == "completed"
    assert updates[-1][1]["status"] == "completed"


def test_worker_completion_falls_back_when_optional_cleanup_columns_are_stale(monkeypatch, capsys):
    calls = []

    class SchemaCacheError(Exception):
        code = "PGRST204"

    def fake_update(job_id, _database, **kwargs):
        calls.append((job_id, kwargs))
        if "lease_expires_at" in kwargs or "worker_id" in kwargs:
            raise SchemaCacheError("Could not find worker_id in schema cache")

    monkeypatch.setattr(main, "_update_job", fake_update)

    main._complete_processing_job("job-1", object(), ["scan-1"])

    assert len(calls) == 2
    assert calls[0][1]["status"] == "completed"
    assert calls[0][1]["lease_expires_at"] is None
    assert calls[0][1]["worker_id"] is None
    assert calls[1][1]["status"] == "completed"
    assert "lease_expires_at" not in calls[1][1]
    assert "worker_id" not in calls[1][1]
    assert "schema cache" in capsys.readouterr().out


def test_worker_post_completion_exception_acknowledges_without_retry(monkeypatch, capsys):
    job_id = "55555555-5555-4555-8555-555555555555"
    rows = {main.JOBS_TABLE: [{"id": job_id, "source": "drive_file", "source_ref": "drive-1", "status": "completed"}]}
    failed_updates = []
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "_claim_processing_job", lambda *_args: {"claimed": True, "status": "processing"})
    monkeypatch.setattr(main, "_process_job", lambda *_args: (_ for _ in ()).throw(RuntimeError("cleanup failed /tmp/purityloop/job-1/output.mp4")))
    monkeypatch.setattr(main, "_update_job", lambda *args, **kwargs: failed_updates.append(kwargs))

    response = main.process_internal_job(main.WorkerJobInput(job_id=UUID(job_id)))

    assert response["status"] == "completed"
    assert response["already_completed"] is True
    assert response["post_completion_error"] is True
    assert failed_updates == []
    output = capsys.readouterr().out
    assert "[worker-temp-path]" in output
    assert "/tmp/purityloop" not in output


def test_worker_pre_completion_processing_failure_returns_retryable_500(monkeypatch):
    job_id = "55555555-5555-4555-8555-555555555555"
    rows = {main.JOBS_TABLE: [{"id": job_id, "source": "drive_file", "source_ref": "drive-1", "status": "processing"}]}
    updates = []
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase(rows))
    monkeypatch.setattr(main, "_claim_processing_job", lambda *_args: {"claimed": True, "status": "processing"})
    monkeypatch.setattr(main, "_process_job", lambda *_args: (_ for _ in ()).throw(RuntimeError("model failed")))
    monkeypatch.setattr(main, "_update_job", lambda *args, **kwargs: updates.append(kwargs))

    response = main.process_internal_job(main.WorkerJobInput(job_id=UUID(job_id)))

    assert response.status_code == 500
    assert updates[-1]["status"] == "failed"
    assert updates[-1]["error"] == "model failed"


def test_worker_endpoint_already_completed_is_idempotent(monkeypatch):
    job_id = "55555555-5555-4555-8555-555555555555"
    monkeypatch.setattr(main, "SERVICE_MODE", "worker")
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: FakeDatabase({}))
    monkeypatch.setattr(main, "_claim_processing_job", lambda *_args: {"claimed": False, "status": "completed"})
    monkeypatch.setattr(main, "_process_job", lambda *_args: (_ for _ in ()).throw(AssertionError("must not duplicate work")))

    response = main.process_internal_job(main.WorkerJobInput(job_id=UUID(job_id)))

    assert response["already_completed"] is True


def test_worker_endpoint_hidden_on_api_service(monkeypatch):
    monkeypatch.setattr(main, "SERVICE_MODE", "api")

    try:
        main.process_internal_job(main.WorkerJobInput(job_id=UUID("55555555-5555-4555-8555-555555555555")))
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected HTTPException")


def test_atomic_claim_migration_has_lock_and_expired_lease_reclaim():
    migration_path = next(Path("supabase/migrations").glob("*_cloud_tasks_mp4_processing.sql"))
    migration = migration_path.read_text(encoding="utf-8").lower()

    assert "create table if not exists public.upload_sessions" in migration
    assert "for update" in migration
    assert "lease_expires_at > now()" in migration
    assert "attempts = coalesce(attempts, 0) + 1" in migration
    assert "grant execute on function public.claim_processing_job" in migration
