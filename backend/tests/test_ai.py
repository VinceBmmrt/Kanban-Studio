import os
import tempfile
import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from models import AIResponse, NewCard, CardUpdate


def _make_parse_result(ai_response: AIResponse):
    result = MagicMock()
    result.choices[0].message.parsed = ai_response
    return result


@pytest.fixture
def client(monkeypatch):
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY", "test-key"))

    import database; importlib.reload(database)
    import routers.board; importlib.reload(routers.board)
    import routers.auth; importlib.reload(routers.auth)
    import routers.ai; importlib.reload(routers.ai)
    import auth as auth_mod; auth_mod.tokens.clear()
    import main; importlib.reload(main)

    with TestClient(main.app) as c:
        yield c

    os.unlink(db_path)


def _login(client: TestClient) -> dict:
    token = client.post("/api/auth/login", json={"username": "user", "password": "password"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_chat_board_in_system_prompt(client):
    headers = _login(client)
    captured = []

    async def fake_parse(**kwargs):
        captured.extend(kwargs["messages"])
        return _make_parse_result(AIResponse(message="Hi!"))

    with patch("routers.ai.client") as mock_client:
        mock_client.beta.chat.completions.parse = AsyncMock(side_effect=fake_parse)
        resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "Hello"}]}, headers=headers)

    assert resp.status_code == 200
    assert resp.json()["message"] == "Hi!"
    system_msg = next(m["content"] for m in captured if m["role"] == "system")
    assert "col-backlog" in system_msg
    assert "Backlog" in system_msg


def test_chat_creates_card(client):
    headers = _login(client)

    async def fake_parse(**kwargs):
        return _make_parse_result(AIResponse(
            message="Added!",
            new_cards=[NewCard(column_id="col-backlog", title="AI Card", details="From AI")],
        ))

    with patch("routers.ai.client") as mock_client:
        mock_client.beta.chat.completions.parse = AsyncMock(side_effect=fake_parse)
        resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "Add a card"}]}, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Added!"
    assert len(data["new_cards"]) == 1
    assert data["new_cards"][0]["title"] == "AI Card"
    assert data["new_cards"][0]["id"].startswith("card-")

    board = client.get("/api/board", headers=headers).json()
    assert any(c["title"] == "AI Card" for c in board["cards"].values())
    backlog = next(col for col in board["columns"] if col["id"] == "col-backlog")
    assert data["new_cards"][0]["id"] in backlog["cardIds"]


def test_chat_updates_card(client):
    headers = _login(client)

    async def fake_parse(**kwargs):
        return _make_parse_result(AIResponse(
            message="Updated!",
            update_cards=[CardUpdate(id="card-1", title="New Title")],
        ))

    with patch("routers.ai.client") as mock_client:
        mock_client.beta.chat.completions.parse = AsyncMock(side_effect=fake_parse)
        resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "Rename card 1"}]}, headers=headers)

    assert resp.status_code == 200
    board = client.get("/api/board", headers=headers).json()
    assert board["cards"]["card-1"]["title"] == "New Title"


def test_chat_deletes_card(client):
    headers = _login(client)

    async def fake_parse(**kwargs):
        return _make_parse_result(AIResponse(message="Deleted!", delete_card_ids=["card-1"]))

    with patch("routers.ai.client") as mock_client:
        mock_client.beta.chat.completions.parse = AsyncMock(side_effect=fake_parse)
        resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "Delete card 1"}]}, headers=headers)

    assert resp.status_code == 200
    assert resp.json()["delete_card_ids"] == ["card-1"]
    board = client.get("/api/board", headers=headers).json()
    assert "card-1" not in board["cards"]


def test_chat_general_question_no_mutations(client):
    headers = _login(client)

    async def fake_parse(**kwargs):
        return _make_parse_result(AIResponse(message="The sky is blue."))

    with patch("routers.ai.client") as mock_client:
        mock_client.beta.chat.completions.parse = AsyncMock(side_effect=fake_parse)
        resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "What colour is the sky?"}]}, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["new_cards"] is None
    assert data["update_cards"] is None
    assert data["delete_card_ids"] is None
