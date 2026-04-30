import json
import logging
import uuid

from fastapi import APIRouter, Request

from ai import client, MODEL
from database import get_db
from models import (
    AIResponse,
    CardUpdate,
    ChatRequest,
    ChatResponse,
    CreatedCard,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai")

SYSTEM_PROMPT = """\
You are a Kanban board assistant. Help the user manage their board.

Current board state:
{board_json}

When the user asks you to create, update, move, or delete cards, populate the relevant fields:
- new_cards: list of cards to create (column_id, title, details)
- update_cards: list of cards to modify (id, and any of: title, details, column_id)
- delete_card_ids: list of card ids to delete
- For general questions, leave all mutation fields null.

Always include a helpful reply in the message field.\
"""


def _board_for_prompt(conn, user_id: int) -> str:
    board = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if not board:
        return "{}"
    cols = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board["id"],)
    ).fetchall()
    data = []
    for col in cols:
        cards = conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ).fetchall()
        data.append({
            "id": col["id"],
            "title": col["title"],
            "cards": [{"id": c["id"], "title": c["title"], "details": c["details"]} for c in cards],
        })
    return json.dumps({"columns": data}, indent=2)


@router.get("/test")
async def ai_test():
    logger.info("Sending test prompt to AI")
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "What is 2+2?"}],
    )
    answer = response.choices[0].message.content
    logger.info("AI response: %s", answer)
    return {"answer": answer}


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(body: ChatRequest, request: Request):
    user_id: int = request.state.user_id

    with get_db() as conn:
        board_json = _board_for_prompt(conn, user_id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(board_json=board_json)}] + [
        {"role": m.role, "content": m.content} for m in body.messages
    ]

    logger.info("AI chat request (%d messages)", len(messages))
    result = await client.beta.chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=AIResponse,
    )
    ai: AIResponse = result.choices[0].message.parsed
    logger.info("AI reply: %s", ai.message)

    created_cards: list[CreatedCard] = []
    applied_updates: list[CardUpdate] = []
    deleted_ids: list[str] = []

    with get_db() as conn:
        if ai.new_cards:
            for nc in ai.new_cards:
                card_id = f"card-{uuid.uuid4().hex[:8]}"
                max_pos = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
                    (nc.column_id,),
                ).fetchone()[0]
                conn.execute(
                    "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
                    (card_id, nc.column_id, nc.title, nc.details, max_pos + 1),
                )
                created_cards.append(CreatedCard(id=card_id, column_id=nc.column_id, title=nc.title, details=nc.details))

        if ai.update_cards:
            for uc in ai.update_cards:
                row = conn.execute(
                    "SELECT title, details, column_id, position FROM cards WHERE id = ?", (uc.id,)
                ).fetchone()
                if not row:
                    continue
                new_title = uc.title if uc.title is not None else row["title"]
                new_details = uc.details if uc.details is not None else row["details"]
                if uc.column_id and uc.column_id != row["column_id"]:
                    max_pos = conn.execute(
                        "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
                        (uc.column_id,),
                    ).fetchone()[0]
                    conn.execute(
                        "UPDATE cards SET title=?, details=?, column_id=?, position=? WHERE id=?",
                        (new_title, new_details, uc.column_id, max_pos + 1, uc.id),
                    )
                    conn.execute(
                        "UPDATE cards SET position=position-1 WHERE column_id=? AND position>?",
                        (row["column_id"], row["position"]),
                    )
                else:
                    conn.execute(
                        "UPDATE cards SET title=?, details=? WHERE id=?",
                        (new_title, new_details, uc.id),
                    )
                applied_updates.append(CardUpdate(id=uc.id, title=new_title, details=new_details, column_id=uc.column_id or row["column_id"]))

        if ai.delete_card_ids:
            for card_id in ai.delete_card_ids:
                row = conn.execute("SELECT column_id, position FROM cards WHERE id=?", (card_id,)).fetchone()
                if not row:
                    continue
                conn.execute("DELETE FROM cards WHERE id=?", (card_id,))
                conn.execute(
                    "UPDATE cards SET position=position-1 WHERE column_id=? AND position>?",
                    (row["column_id"], row["position"]),
                )
                deleted_ids.append(card_id)

    return ChatResponse(
        message=ai.message,
        new_cards=created_cards or None,
        update_cards=applied_updates or None,
        delete_card_ids=deleted_ids or None,
    )
