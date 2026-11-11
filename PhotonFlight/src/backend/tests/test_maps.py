"""API tests with PostgreSQL connections mocked out.

Run from the project root: python -m pytest -q
These tests verify API behavior and query parameters, not PostgreSQL semantics.
"""
from contextlib import nullcontext
from datetime import datetime, timezone
from unittest.mock import Mock

import psycopg
import pytest
from fastapi.testclient import TestClient

from src.backend.app.auth import get_current_user_id
from src.backend.app.database import get_connection
from src.backend.app.main import app

USER_ID = 3
HEADERS = {"Authorization": "Bearer test-only-secret"}


@pytest.fixture
def sample_map():
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
    def forbid_real_connection(*args, **kwargs):
        pytest.fail("A test attempted to connect to a real database.")

    monkeypatch.setattr(psycopg, "connect", forbid_real_connection)

    connection = Mock()
    connection.transaction.side_effect = lambda: nullcontext()
    connection.execute.return_value.fetchone.return_value = None
    connection.execute.return_value.fetchall.return_value = []

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_connection] = lambda: connection
    app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    try:
        with TestClient(app) as client:
            yield client, connection
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_health_does_not_query_database(api):
    client, connection = api
    assert client.get("/health").json() == {"status": "ok"}
    connection.execute.assert_not_called()


def test_list_maps_filters_by_current_user(api, sample_map):
    client, connection = api
    connection.execute.return_value.fetchall.return_value = [sample_map]

    response = client.get("/api/maps?limit=10&offset=20", headers=HEADERS)

    assert response.status_code == 200
    assert response.json()[0]["map_id"] == 12
    query, params = connection.execute.call_args.args
    assert "created_by" in str(query)
    assert params == (USER_ID, 10, 20)


def test_empty_map_list(api):
    client, _ = api
    response = client.get("/api/maps", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == []


def test_get_map_filters_by_id_and_owner(api, sample_map):
    client, connection = api
    connection.execute.return_value.fetchone.return_value = sample_map

    response = client.get("/api/maps/12", headers=HEADERS)

    assert response.status_code == 200
    assert response.json()["created_by"] == USER_ID
    query, params = connection.execute.call_args.args
    assert "map_id" in str(query)
    assert "created_by" in str(query)
    assert params == (12, USER_ID)


def test_missing_or_inaccessible_map(api):
    client, _ = api
    response = client.get("/api/maps/999", headers=HEADERS)
    assert response.status_code == 404
    assert response.json() == {"detail": "Record not found."}


def test_create_map_uses_authenticated_owner(api, sample_map):
    client, connection = api
    connection.execute.return_value.fetchone.return_value = sample_map

    response = client.post("/api/maps", headers=HEADERS, json={
        "name": "  Campus Survey  ", "description": "North parking lot",
        "latitude": 36.12, "longitude": -97.07,
    })

    assert response.status_code == 201
    assert response.json()["map_id"] == 12
    assert response.json()["created_at"].startswith("2026-10-22T14:30:00")
    query, params = connection.execute.call_args.args
    assert "maps" in str(query)
    assert params == (
        "Campus Survey", "North parking lot", None, 36.12, -97.07, USER_ID
    )
    connection.transaction.assert_called_once()


@pytest.mark.parametrize("payload", [
    {}, {"name": ""}, {"name": "   "}, {"name": "x" * 151},
    {"name": "Map", "latitude": 91},
    {"name": "Map", "longitude": -181},
    {"name": "Map", "created_by": 999},
])
def test_invalid_create_request_does_not_execute_sql(api, payload):
    client, connection = api
    response = client.post("/api/maps", headers=HEADERS, json=payload)
    assert response.status_code == 422
    connection.execute.assert_not_called()


@pytest.mark.parametrize("path", [
    "/api/maps?limit=0", "/api/maps?limit=101", "/api/maps?offset=-1",
    "/api/maps/0", "/api/maps/not-a-number",
])
def test_invalid_query_or_path(api, path):
    client, connection = api
    assert client.get(path, headers=HEADERS).status_code == 422
    connection.execute.assert_not_called()


def test_create_with_nonexistent_database_user(api):
    client, connection = api
    connection.execute.side_effect = psycopg.errors.ForeignKeyViolation(
        "private details"
    )
    response = client.post("/api/maps", headers=HEADERS, json={"name": "Map"})
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Record conflicts with database constraints."
    }


@pytest.mark.parametrize("method,path,payload", [
    ("GET", "/api/maps", None),
    ("GET", "/api/maps/12", None),
    ("POST", "/api/maps", {"name": "Map"}),
])
def test_database_failure_is_not_exposed(api, method, path, payload):
    client, connection = api
    connection.execute.side_effect = psycopg.OperationalError(
        "private connection details"
    )
    response = client.request(method, path, headers=HEADERS, json=payload)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database operation unavailable."}
    assert "private" not in response.text
