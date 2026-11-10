"""API tests for LiDAR file upload, listing, and download behavior."""
from contextlib import nullcontext
from hashlib import sha256
from unittest.mock import Mock

import psycopg
import pytest
from fastapi.testclient import TestClient

from git.PhotonFlight.src.backend.app.auth import get_current_user_id
from git.PhotonFlight.src.backend.app.database import get_connection
from git.PhotonFlight.src.backend.app.main import app

USER_ID = 3
HEADERS = {"Authorization": "Bearer test-token"}
LAS_BYTES = b"LASF" + b"\x00" * 20


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


def test_upload_stores_file_bytes_and_metadata(api):
    client, connection = api
    map_result = Mock()
    map_result.fetchone.return_value = {"map_id": 12}
    insert_result = Mock()
    insert_result.fetchone.return_value = {
        "lidar_id": 45,
        "map_id": 12,
        "uploaded_by": USER_ID,
        "file_location": "site.las",
        "file_format": "LAS",
        "uploaded_at": "2026-11-07T12:00:00",
        "file_size_bytes": len(LAS_BYTES),
        "sha256": sha256(LAS_BYTES).hexdigest(),
    }
    connection.execute.side_effect = [map_result, insert_result]

    response = client.post(
        "/api/lidar/upload",
        headers=HEADERS,
        data={"map_id": "12"},
        files={"file": ("C:\\survey\\site.las", LAS_BYTES, "application/vnd.las")},
    )

    assert response.status_code == 201
    assert response.json()["lidar_id"] == 45
    assert response.json()["file_location"] == "site.las"
    map_query, map_params = connection.execute.call_args_list[0].args
    insert_query, insert_params = connection.execute.call_args_list[1].args
    assert "created_by" in str(map_query)
    assert map_params == (12, USER_ID)
    assert "file_data" in str(insert_query)
    assert "content_type" in str(insert_query)
    assert insert_params == (
        12,
        USER_ID,
        len(LAS_BYTES),
        LAS_BYTES,
        "site.las",
        sha256(LAS_BYTES).hexdigest(),
        "LAS",
        "application/vnd.las",
    )


def test_upload_rejects_maps_not_owned_by_current_user(api):
    client, connection = api

    response = client.post(
        "/api/lidar/upload",
        headers=HEADERS,
        data={"map_id": "12"},
        files={"file": ("site.las", LAS_BYTES, "application/vnd.las")},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Map not found."}
    connection.execute.assert_called_once()


def test_upload_rejects_non_las_content(api):
    client, connection = api
    connection.execute.return_value.fetchone.return_value = {"map_id": 12}

    response = client.post(
        "/api/lidar/upload",
        headers=HEADERS,
        data={"map_id": "12"},
        files={"file": ("site.las", b"not LAS data", "application/vnd.las")},
    )

    assert response.status_code == 415
    assert response.json() == {"detail": "File does not have a LAS/LAZ header."}
    assert connection.execute.call_count == 1


def test_list_lidar_returns_metadata_without_file_data(api):
    client, connection = api
    connection.execute.return_value.fetchall.return_value = [{
        "lidar_id": 45,
        "map_id": 12,
        "uploaded_by": USER_ID,
        "file_location": "site.las",
        "file_format": "LAS",
        "uploaded_at": "2026-11-07T12:00:00",
        "file_size_bytes": len(LAS_BYTES),
        "sha256": sha256(LAS_BYTES).hexdigest(),
    }]

    response = client.get("/api/lidar", headers=HEADERS)

    assert response.status_code == 200
    assert response.json()[0]["file_location"] == "site.las"
    query = connection.execute.call_args.args[0]
    assert "file_data" not in str(query)


def test_list_lidar_can_filter_by_owned_map(api):
    client, connection = api

    response = client.get(
        "/api/lidar?map_id=12&limit=10&offset=20",
        headers=HEADERS,
    )

    assert response.status_code == 200
    query, params = connection.execute.call_args.args
    assert "created_by" in str(query)
    assert "AND map_id = %s" in str(query)
    assert params == (USER_ID, 12, 10, 20)


def test_download_returns_bytes_only_for_owned_lidar(api):
    client, connection = api
    connection.execute.return_value.fetchone.return_value = {
        "file_data": LAS_BYTES,
        "content_type": "application/vnd.las",
    }

    response = client.get("/api/lidar/45/file", headers=HEADERS)

    assert response.status_code == 200
    assert response.content == LAS_BYTES
    assert response.headers["content-type"] == "application/vnd.las"
    query, params = connection.execute.call_args.args
    assert "created_by" in query
    assert params == (45, USER_ID)


def test_download_returns_not_found_for_missing_or_inaccessible_file(api):
    client, _ = api

    response = client.get("/api/lidar/45/file", headers=HEADERS)

    assert response.status_code == 404
    assert response.json() == {"detail": "Lidar file not found."}
