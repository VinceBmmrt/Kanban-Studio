import uuid
from fastapi import APIRouter, HTTPException, Request

from database import get_db
from models import BoardData, Card, Column, CreateCardRequest, MoveCardRequest, RenameColumnRequest, UpdateCardRequest

router = APIRouter(prefix="/api/board")


def _get_board_id(conn, user_id: int) -> int:
    row = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return row["id"]


@router.get("", response_model=BoardData)
def get_board(request: Request):
    user_id: int = request.state.user_id
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        col_rows = conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
            (board_id,),
        ).fetchall()
        card_rows = conn.execute(
            "SELECT c.id, c.column_id, c.title, c.details "
            "FROM cards c JOIN columns col ON c.column_id = col.id "
            "WHERE col.board_id = ? ORDER BY c.column_id, c.position",
            (board_id,),
        ).fetchall()

    card_ids_by_col: dict[str, list[str]] = {row["id"]: [] for row in col_rows}
    cards: dict[str, Card] = {}
    for row in card_rows:
        card_ids_by_col[row["column_id"]].append(row["id"])
        cards[row["id"]] = Card(id=row["id"], title=row["title"], details=row["details"])

    columns = [Column(id=row["id"], title=row["title"], cardIds=card_ids_by_col[row["id"]]) for row in col_rows]
    return BoardData(columns=columns, cards=cards)


@router.put("/column/{column_id}")
def rename_column(column_id: str, body: RenameColumnRequest, request: Request):
    user_id: int = request.state.user_id
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        result = conn.execute(
            "UPDATE columns SET title = ? WHERE id = ? AND board_id = ?",
            (body.title, column_id, board_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Column not found")
    return {"ok": True}


@router.post("/card")
def create_card(body: CreateCardRequest, request: Request):
    user_id: int = request.state.user_id
    card_id = f"card-{uuid.uuid4().hex[:8]}"
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        col = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?",
            (body.column_id, board_id),
        ).fetchone()
        if not col:
            raise HTTPException(status_code=404, detail="Column not found")
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
            (body.column_id,),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
            (card_id, body.column_id, body.title, body.details, max_pos + 1),
        )
    return Card(id=card_id, title=body.title, details=body.details)


@router.put("/card/{card_id}")
def update_card(card_id: str, body: UpdateCardRequest, request: Request):
    user_id: int = request.state.user_id
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        row = conn.execute(
            "SELECT c.id, c.title, c.details FROM cards c "
            "JOIN columns col ON c.column_id = col.id "
            "WHERE c.id = ? AND col.board_id = ?",
            (card_id, board_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        new_title = body.title if body.title is not None else row["title"]
        new_details = body.details if body.details is not None else row["details"]
        conn.execute(
            "UPDATE cards SET title = ?, details = ? WHERE id = ?",
            (new_title, new_details, card_id),
        )
    return Card(id=card_id, title=new_title, details=new_details)


@router.delete("/card/{card_id}")
def delete_card(card_id: str, request: Request):
    user_id: int = request.state.user_id
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        row = conn.execute(
            "SELECT c.id, c.column_id, c.position FROM cards c "
            "JOIN columns col ON c.column_id = col.id "
            "WHERE c.id = ? AND col.board_id = ?",
            (card_id, board_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        conn.execute(
            "UPDATE cards SET position = position - 1 "
            "WHERE column_id = ? AND position > ?",
            (row["column_id"], row["position"]),
        )
    return {"ok": True}


@router.put("/card/{card_id}/move")
def move_card(card_id: str, body: MoveCardRequest, request: Request):
    user_id: int = request.state.user_id
    with get_db() as conn:
        board_id = _get_board_id(conn, user_id)
        card = conn.execute(
            "SELECT c.id, c.column_id, c.position FROM cards c "
            "JOIN columns col ON c.column_id = col.id "
            "WHERE c.id = ? AND col.board_id = ?",
            (card_id, board_id),
        ).fetchone()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        dest_col = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?",
            (body.column_id, board_id),
        ).fetchone()
        if not dest_col:
            raise HTTPException(status_code=404, detail="Destination column not found")

        src_col_id = card["column_id"]
        src_pos = card["position"]
        dst_col_id = body.column_id
        dst_pos = body.position

        col_size = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE column_id = ?", (dst_col_id,)
        ).fetchone()[0]
        max_dst = col_size if src_col_id != dst_col_id else col_size - 1
        dst_pos = max(0, min(dst_pos, max_dst))

        if src_col_id == dst_col_id:
            if src_pos < dst_pos:
                conn.execute(
                    "UPDATE cards SET position = position - 1 "
                    "WHERE column_id = ? AND position > ? AND position <= ?",
                    (src_col_id, src_pos, dst_pos),
                )
            elif src_pos > dst_pos:
                conn.execute(
                    "UPDATE cards SET position = position + 1 "
                    "WHERE column_id = ? AND position >= ? AND position < ?",
                    (src_col_id, dst_pos, src_pos),
                )
        else:
            conn.execute(
                "UPDATE cards SET position = position - 1 "
                "WHERE column_id = ? AND position > ?",
                (src_col_id, src_pos),
            )
            conn.execute(
                "UPDATE cards SET position = position + 1 "
                "WHERE column_id = ? AND position >= ?",
                (dst_col_id, dst_pos),
            )

        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (dst_col_id, dst_pos, card_id),
        )
    return {"ok": True}
