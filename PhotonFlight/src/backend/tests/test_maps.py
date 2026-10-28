"""API tests only: PostgreSQL is never contacted and .env is never loaded.

Run from src/backend: python -m pytest -q
These mocks verify API behavior and query parameters, not PostgreSQL semantics.
"""
from contextlib import nullcontext
from datetime import datetime, timezone
from unittest.mock import Mock

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.database import get_connection
from app.main import app

TOKEN = "test-only-secret"
USER_ID = 3
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def sample_map():
    # A representative row that a real PostgreSQL query would return.
    return {
        "map_id": 12,
        "name": "Campus Survey",
        "description": "North parking lot",
        "created_by": USER_ID,
        "created_at": datetime(2026, 10, 22, 14, 30, tzinfo=timezone.utc),
        "location_name": None,
        "latitude": 36.12,
        "longitude": -97.07,
    }


@pytest.fixture
def api(monkeypatch):
    # Fail immediately if any test accidentally tries to open a real connection.
    def forbid_real_connection(*args, **kwargs):
        pytest.fail("A test attempted to connect to a real database.")

    monkeypatch.setattr(psycopg, "connect", forbid_real_connection)

    # No .env or environment values are needed: tests supply their own settings.
    settings = Settings.model_construct(dev_api_token=None, dev_user_id=None,
                                        database_url=None)
    from pydantic import SecretStr
    settings.dev_api_token = SecretStr(TOKEN)
    settings.dev_user_id = USER_ID

    connection = Mock()
    connection.transaction.side_effect = lambda: nullcontext()
    connection.execute.return_value.fetchone.return_value = None
    connection.execute.return_value.fetchall.return_value = []

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_connection] = lambda: connection
    try:
        # Requests go directly to FastAPI in memory; no running server is needed.
        with TestClient(app) as client:
            yield client, connection, settings
    finally:
        # Keep test configuration from leaking into another test.
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_health_does_not_query_database(api):
    client, connection, _ = api
    assert client.get("/health").json() == {"status": "ok"}
    connection.execute.assert_not_called()


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong-token"}])
def test_missing_or_wrong_token(api, headers):
    client, connection, _ = api
    response = client.get("/api/maps", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    connection.execute.assert_not_called()


def test_missing_auth_configuration(api):
    client, connection, settings = api
    settings.dev_api_token = None
    assert client.get("/api/maps", headers=HEADERS).status_code == 503
    connection.execute.assert_not_called()


def test_list_maps_filters_by_current_user(api, sample_map):
    client, connection, _ = api
    connection.execute.return_value.fetchall.return_value = [sample_map]
    response = client.get("/api/maps?limit=10&offset=20", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()[0]["map_id"] == 12
    sql, params = connection.execute.call_args.args
    assert "WHERE created_by = %s" in sql
    assert params == (USER_ID, 10, 20)


def test_empty_map_list(api):
    client, _, _ = api
    response = client.get("/api/maps", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == []


def test_get_map_filters_by_id_and_owner(api, sample_map):
    client, connection, _ = api
    connection.execute.return_value.fetchone.return_value = sample_map
    response = client.get("/api/maps/12", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["created_by"] == USER_ID
    sql, params = connection.execute.call_args.args
    assert "map_id = %s AND created_by = %s" in sql
    assert params == (12, USER_ID)


def test_missing_or_inaccessible_map(api):
    # The fake represents the ownership-filtered query returning no matching row.
    client, _, _ = api
    response = client.get("/api/maps/999", headers=HEADERS)
    assert response.status_code == 404
    assert response.json() == {"detail": "Map not found."}


def test_create_map_uses_authenticated_owner(api, sample_map):
    client, connection, _ = api
    connection.execute.return_value.fetchone.return_value = sample_map
    response = client.post("/api/maps", headers=HEADERS, json={
        "name": "  Campus Survey  ", "description": "North parking lot",
        "latitude": 36.12, "longitude": -97.07,
    })
    assert response.status_code == 201
    assert response.json()["map_id"] == 12
    assert response.json()["created_at"].startswith("2026-10-22T14:30:00")
    sql, params = connection.execute.call_args.args
    assert "INSERT INTO public.maps" in sql
    assert params == ("Campus Survey", "North parking lot", USER_ID,
                      None, 36.12, -97.07)
    connection.transaction.assert_called_once()


@pytest.mark.parametrize("payload", [
    {}, {"name": ""}, {"name": "   "}, {"name": "x" * 151},
    {"name": "Map", "latitude": 91},
    {"name": "Map", "longitude": -181},
    {"name": "Map", "created_by": 999},
])
def test_invalid_create_request_does_not_execute_sql(api, payload):
    client, connection, _ = api
    response = client.post("/api/maps", headers=HEADERS, json=payload)
    assert response.status_code == 422
    connection.execute.assert_not_called()


@pytest.mark.parametrize("path", [
    "/api/maps?limit=0", "/api/maps?limit=101", "/api/maps?offset=-1",
    "/api/maps/0", "/api/maps/not-a-number",
])
def test_invalid_query_or_path(api, path):
    client, connection, _ = api
    assert client.get(path, headers=HEADERS).status_code == 422
    connection.execute.assert_not_called()


def test_create_with_nonexistent_database_user(api):
    client, connection, _ = api
    connection.execute.side_effect = psycopg.errors.ForeignKeyViolation("private details")
    response = client.post("/api/maps", headers=HEADERS, json={"name": "Map"})
    assert response.status_code == 409
    assert response.json() == {"detail": "Configured user does not exist in the database."}


@pytest.mark.parametrize("method,path,payload", [
    ("GET", "/api/maps", None),
    ("GET", "/api/maps/12", None),
    ("POST", "/api/maps", {"name": "Map"}),
])
def test_database_failure_is_not_exposed(api, method, path, payload):
    client, connection, _ = api
    connection.execute.side_effect = psycopg.OperationalError("private connection details")
    response = client.request(method, path, headers=HEADERS, json=payload)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database operation unavailable."}
    assert "private" not in response.text
