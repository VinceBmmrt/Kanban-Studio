import { getToken } from "./auth";
import type { BoardData, Card } from "./kanban";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function fetchBoard(): Promise<BoardData> {
  const res = await apiFetch("/api/board");
  if (!res.ok) throw new Error("Failed to load board");
  return res.json();
}

export async function apiRenameColumn(columnId: string, title: string): Promise<void> {
  const res = await apiFetch(`/api/board/column/${columnId}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to rename column");
}

export async function apiCreateCard(columnId: string, title: string, details: string): Promise<Card> {
  const res = await apiFetch("/api/board/card", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
  });
  if (!res.ok) throw new Error("Failed to create card");
  return res.json();
}

export async function apiDeleteCard(cardId: string): Promise<void> {
  const res = await apiFetch(`/api/board/card/${cardId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete card");
}

export async function apiMoveCard(cardId: string, columnId: string, position: number): Promise<void> {
  const res = await apiFetch(`/api/board/card/${cardId}/move`, {
    method: "PUT",
    body: JSON.stringify({ column_id: columnId, position }),
  });
  if (!res.ok) throw new Error("Failed to move card");
}
