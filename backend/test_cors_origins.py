import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

import main


PRODUCTION_ORIGIN = "https://purityloop-ai.vercel.app"


def _production_client(monkeypatch, origin=PRODUCTION_ORIGIN):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", origin)
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=main.cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return TestClient(app)


def test_production_defaults_to_single_frontend_origin(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)

    assert main.cors_origins() == [PRODUCTION_ORIGIN]


def test_production_normalizes_trailing_slash(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", f"{PRODUCTION_ORIGIN}/")

    assert main.cors_origins() == [PRODUCTION_ORIGIN]


def test_production_ignores_legacy_cors_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", PRODUCTION_ORIGIN)
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")

    assert main.cors_origins() == [PRODUCTION_ORIGIN]


def test_production_ignores_legacy_allowed_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", PRODUCTION_ORIGIN)
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://preview.example.test")

    assert main.cors_origins() == [PRODUCTION_ORIGIN]


@pytest.mark.parametrize("origin", ["*", "http://localhost:3000"])
def test_production_rejects_unsafe_origin(monkeypatch, origin):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", origin)

    with pytest.raises(RuntimeError, match="Production FRONTEND_ORIGIN"):
        main.cors_origins()


def test_development_keeps_localhost(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")

    assert "http://localhost:3000" in main.cors_origins()


def test_production_preflight_allows_frontend_origin(monkeypatch):
    client = _production_client(monkeypatch)

    response = client.options(
        "/api/scans",
        headers={
            "Origin": PRODUCTION_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == PRODUCTION_ORIGIN
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_production_preflight_rejects_localhost(monkeypatch):
    client = _production_client(monkeypatch)

    response = client.options(
        "/api/scans",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert "access-control-allow-origin" not in response.headers
