from types import SimpleNamespace

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


class FakeAuth:
    def get_user(self, token):
        if token == "valid-user-token":
            return SimpleNamespace(user=SimpleNamespace(id="user-1", email="user@example.test", is_anonymous=False))
        if token == "anonymous-token":
            return SimpleNamespace(user=SimpleNamespace(id="anon-1", email=None, is_anonymous=True))
        raise RuntimeError("token rejected")


class FakeSupabaseClient:
    auth = FakeAuth()


@pytest.fixture(autouse=True)
def fake_supabase_auth(monkeypatch):
    monkeypatch.setattr(main, "_new_supabase_client", lambda: FakeSupabaseClient())
    yield


def test_health_routes_are_public():
    assert client.get("/health").status_code == 200
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize(
    ("headers", "expected_detail"),
    [
        ({}, "Authentication required."),
        ({"Authorization": "Basic abc"}, "Authentication required."),
        ({"Authorization": "Bearer invalid-user-token"}, "Invalid authentication token."),
        ({"Authorization": "Bearer anonymous-token"}, "Invalid authentication token."),
    ],
)
def test_scan_history_requires_valid_bearer(headers, expected_detail):
    response = client.get("/api/scans", headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == expected_detail
    assert "invalid-user-token" not in response.text
    assert "anonymous-token" not in response.text


def test_configured_service_role_key_is_not_accepted(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "configured-service-role")

    response = client.get("/api/scans", headers={"Authorization": "Bearer configured-service-role"})

    assert response.status_code == 401
    assert "configured-service-role" not in response.text


def test_valid_bearer_builds_authenticated_principal():
    principal = main.require_principal(HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-user-token"))

    assert principal.kind == "user"
    assert principal.id == "user-1"
    assert principal.email == "user@example.test"
    assert principal.role == "authenticated"
    assert {"scan:read", "scan:write", "job:read", "review:write"}.issubset(principal.scopes)


def test_missing_scope_returns_403(monkeypatch):
    monkeypatch.setattr(main, "verify_supabase_token", lambda _token: main.Principal("user", "user-1", frozenset()))

    response = client.get("/api/scans", headers={"Authorization": "Bearer valid-user-token"})

    assert response.status_code == 403
    assert "Missing API scope" in response.json()["detail"]


def test_google_oauth_routes_are_blocked_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")

    start_response = client.get("/api/google/auth", headers={"Authorization": "Bearer valid-user-token"}, follow_redirects=False)
    callback_response = client.get("/api/google/callback?code=abc&state=state")

    assert start_response.status_code == 404
    assert callback_response.status_code == 404


def test_google_oauth_start_allows_valid_user_in_development(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")

    flow = SimpleNamespace(
        code_verifier="verifier",
        authorization_url=lambda **_kwargs: ("https://accounts.example.test/oauth", "state-1"),
    )
    monkeypatch.setattr(main, "oauth_flow", lambda: flow)
    monkeypatch.setattr(main, "save_oauth_state", lambda _state, _verifier: None)

    response = client.get("/api/google/auth", headers={"Authorization": "Bearer valid-user-token"}, follow_redirects=False)

    assert response.status_code in (302, 307)
    assert response.headers["location"] == "https://accounts.example.test/oauth"
