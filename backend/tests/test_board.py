import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_path)

    import auth as auth_mod
    auth_mod.tokens.clear()
    auth_mod._login_attempts.clear()

    import main
    with TestClient(main.app) as c:
        yield c


def _login(client: TestClient) -> str:
    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- auth ---

def test_login_success(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert resp.status_code == 401


def test_unauthenticated_board(client):
    resp = client.get("/api/board")
    assert resp.status_code == 401


# --- GET /api/board ---

def test_get_board(client):
    token = _login(client)
    resp = client.get("/api/board", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "columns" in data and "cards" in data
    col_ids = [c["id"] for c in data["columns"]]
    assert col_ids == ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]
    assert len(data["cards"]) == 8


def test_get_board_column_card_ids(client):
    token = _login(client)
    data = client.get("/api/board", headers=_auth(token)).json()
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert set(backlog["cardIds"]) == {"card-1", "card-2"}


# --- PUT /api/board/column/{column_id} ---

def test_rename_column(client):
    token = _login(client)
    resp = client.put("/api/board/column/col-backlog", json={"title": "To Do"}, headers=_auth(token))
    assert resp.status_code == 200
    data = client.get("/api/board", headers=_auth(token)).json()
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert backlog["title"] == "To Do"


def test_rename_nonexistent_column(client):
    token = _login(client)
    resp = client.put("/api/board/column/col-fake", json={"title": "X"}, headers=_auth(token))
    assert resp.status_code == 404


# --- POST /api/board/card ---

def test_create_card(client):
    token = _login(client)
    resp = client.post(
        "/api/board/card",
        json={"column_id": "col-backlog", "title": "New task", "details": "details here"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    card = resp.json()
    assert card["title"] == "New task"
    assert card["details"] == "details here"
    assert card["id"].startswith("card-")

    data = client.get("/api/board", headers=_auth(token)).json()
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert card["id"] in backlog["cardIds"]


def test_create_card_invalid_column(client):
    token = _login(client)
    resp = client.post(
        "/api/board/card",
        json={"column_id": "col-fake", "title": "X"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


# --- PUT /api/board/card/{card_id} ---

def test_update_card(client):
    token = _login(client)
    resp = client.put(
        "/api/board/card/card-1",
        json={"title": "Updated title"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    data = client.get("/api/board", headers=_auth(token)).json()
    assert data["cards"]["card-1"]["title"] == "Updated title"


def test_update_card_details_only(client):
    token = _login(client)
    resp = client.put(
        "/api/board/card/card-1",
        json={"details": "new details"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["details"] == "new details"


def test_update_nonexistent_card(client):
    token = _login(client)
    resp = client.put("/api/board/card/card-999", json={"title": "X"}, headers=_auth(token))
    assert resp.status_code == 404


# --- DELETE /api/board/card/{card_id} ---

def test_delete_card(client):
    token = _login(client)
    resp = client.delete("/api/board/card/card-1", headers=_auth(token))
    assert resp.status_code == 200
    data = client.get("/api/board", headers=_auth(token)).json()
    assert "card-1" not in data["cards"]
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert "card-1" not in backlog["cardIds"]


def test_delete_nonexistent_card(client):
    token = _login(client)
    resp = client.delete("/api/board/card/card-999", headers=_auth(token))
    assert resp.status_code == 404


# --- PUT /api/board/card/{card_id}/move ---

def test_move_card_to_different_column(client):
    token = _login(client)
    resp = client.put(
        "/api/board/card/card-1/move",
        json={"column_id": "col-done", "position": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    data = client.get("/api/board", headers=_auth(token)).json()
    done = next(c for c in data["columns"] if c["id"] == "col-done")
    assert "card-1" in done["cardIds"]
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert "card-1" not in backlog["cardIds"]


def test_move_card_within_column(client):
    token = _login(client)
    # card-1 is at position 0, card-2 at position 1 in col-backlog
    resp = client.put(
        "/api/board/card/card-1/move",
        json={"column_id": "col-backlog", "position": 1},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    data = client.get("/api/board", headers=_auth(token)).json()
    backlog = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert backlog["cardIds"].index("card-1") == 1
    assert backlog["cardIds"].index("card-2") == 0


def test_move_card_invalid_column(client):
    token = _login(client)
    resp = client.put(
        "/api/board/card/card-1/move",
        json={"column_id": "col-fake", "position": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 404


# --- logout invalidates token ---

def test_logout_invalidates_token(client):
    token = _login(client)
    client.post("/api/auth/logout", headers=_auth(token))
    resp = client.get("/api/board", headers=_auth(token))
    assert resp.status_code == 401
