from pydantic import BaseModel


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: str
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None


class MoveCardRequest(BaseModel):
    column_id: str
    position: int


# --- AI chat models ---

class NewCard(BaseModel):
    column_id: str
    title: str
    details: str = ""


class CardUpdate(BaseModel):
    id: str
    title: str | None = None
    details: str | None = None
    column_id: str | None = None


class AIResponse(BaseModel):
    """Structured output schema sent to the AI."""
    message: str
    new_cards: list[NewCard] | None = None
    update_cards: list[CardUpdate] | None = None
    delete_card_ids: list[str] | None = None


class CreatedCard(BaseModel):
    """New card with its DB-generated id, returned to the frontend."""
    id: str
    column_id: str
    title: str
    details: str


class ChatResponse(BaseModel):
    """What the /api/ai/chat endpoint returns to the frontend."""
    message: str
    new_cards: list[CreatedCard] | None = None
    update_cards: list[CardUpdate] | None = None
    delete_card_ids: list[str] | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
