"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AISidebar } from "@/components/AISidebar";
import { moveCard, type BoardData } from "@/lib/kanban";
import { clearToken } from "@/lib/auth";
import {
  apiFetch,
  fetchBoard,
  apiRenameColumn,
  apiCreateCard,
  apiDeleteCard,
  apiMoveCard,
  type ChatResponse,
} from "@/lib/api";

export const KanbanBoard = () => {
  const router = useRouter();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch(() => setError("Failed to load board."))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    clearToken();
    router.replace("/login");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id || !board) return;

    const newColumns = moveCard(board.columns, active.id as string, over.id as string);
    const newColumn = newColumns.find((col) => col.cardIds.includes(active.id as string));
    if (!newColumn) return;

    const position = newColumn.cardIds.indexOf(active.id as string);
    setBoard((prev) => (prev ? { ...prev, columns: newColumns } : prev));
    apiMoveCard(active.id as string, newColumn.id, position).catch(() =>
      setError("Failed to move card.")
    );
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((col) => (col.id === columnId ? { ...col, title } : col)) }
        : prev
    );
  };

  const handleRenameColumnBlur = useCallback((columnId: string, title: string) => {
    apiRenameColumn(columnId, title).catch(() => setError("Failed to rename column."));
  }, []);

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    try {
      const card = await apiCreateCard(columnId, title, details);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: { ...prev.cards, [card.id]: card },
              columns: prev.columns.map((col) =>
                col.id === columnId ? { ...col, cardIds: [...col.cardIds, card.id] } : col
              ),
            }
          : prev
      );
    } catch {
      setError("Failed to add card.");
    }
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: Object.fromEntries(Object.entries(prev.cards).filter(([id]) => id !== cardId)),
        columns: prev.columns.map((col) =>
          col.id === columnId ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) } : col
        ),
      };
    });
    apiDeleteCard(cardId).catch(() => setError("Failed to delete card."));
  };

  const handleAIMutation = useCallback((resp: ChatResponse) => {
    setBoard((prev) => {
      if (!prev) return prev;
      let { columns, cards } = prev;

      if (resp.new_cards) {
        for (const nc of resp.new_cards) {
          cards = { ...cards, [nc.id]: { id: nc.id, title: nc.title, details: nc.details } };
          columns = columns.map((col) =>
            col.id === nc.column_id ? { ...col, cardIds: [...col.cardIds, nc.id] } : col
          );
        }
      }

      if (resp.update_cards) {
        for (const uc of resp.update_cards) {
          if (!cards[uc.id]) continue;
          cards = {
            ...cards,
            [uc.id]: {
              ...cards[uc.id],
              ...(uc.title != null ? { title: uc.title } : {}),
              ...(uc.details != null ? { details: uc.details } : {}),
            },
          };
          if (uc.column_id) {
            const src = columns.find((col) => col.cardIds.includes(uc.id));
            if (src && src.id !== uc.column_id) {
              columns = columns.map((col) => {
                if (col.id === src.id) return { ...col, cardIds: col.cardIds.filter((id) => id !== uc.id) };
                if (col.id === uc.column_id) return { ...col, cardIds: [...col.cardIds, uc.id] };
                return col;
              });
            }
          }
        }
      }

      if (resp.delete_card_ids) {
        for (const id of resp.delete_card_ids) {
          const { [id]: _, ...rest } = cards;
          cards = rest;
          columns = columns.map((col) => ({ ...col, cardIds: col.cardIds.filter((cid) => cid !== id) }));
        }
      }

      return { ...prev, columns, cards };
    });
  }, []);

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          Loading board…
        </p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold text-red-500">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages, and capture quick
                notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label="Toggle AI sidebar"
                className="rounded-xl border border-[var(--stroke)] bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
              >
                AI
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
              >
                Log out
              </button>
            </div>
          </div>
          {error && (
            <p className="text-xs font-semibold text-red-500" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onRenameBlur={handleRenameColumnBlur}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {sidebarOpen && (
        <AISidebar onMutation={handleAIMutation} onClose={() => setSidebarOpen(false)} />
      )}
    </div>
  );
};
