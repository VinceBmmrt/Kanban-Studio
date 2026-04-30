from pydantic import BaseModel, Field


class NewCard(BaseModel):
    column_id: str
    title: str = Field(min_length=1)
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
