"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
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
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
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

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args);
    return pointer.length > 0 ? pointer : rectIntersection(args);
  }, []);

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over || !board) { setOverColumnId(null); return; }
    const overId = over.id as string;
    const isColumn = board.columns.some((col) => col.id === overId);
    if (isColumn) {
      setOverColumnId(overId);
    } else {
      const col = board.columns.find((col) => col.cardIds.includes(overId));
      setOverColumnId(col?.id ?? null);
    }
  }, [board]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setOverColumnId(null);
    if (!over || active.id === over.id || !board) return;

    const newColumns = moveCard(board.columns, active.id as string, over.id as string);
    const newColumn = newColumns.find((col) => col.cardIds.includes(active.id as string));
    if (!newColumn) return;

    const position = newColumn.cardIds.indexOf(active.id as string);
    setBoard((prev) => (prev ? { ...prev, columns: newColumns } : prev));
    apiMoveCard(active.id as string, newColumn.id, position)
      .then(() => setError(null))
      .catch(() => setError("Failed to move card."));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((col) => (col.id === columnId ? { ...col, title } : col)) }
        : prev
    );
  };

  const handleRenameColumnBlur = useCallback((columnId: string, title: string) => {
    if (!title.trim()) return;
    apiRenameColumn(columnId, title)
      .then(() => setError(null))
      .catch(() => setError("Failed to rename column."));
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
      setError(null);
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
    apiDeleteCard(cardId)
      .then(() => setError(null))
      .catch(() => setError("Failed to delete card."));
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

  const totalCards = Object.keys(board.cards).length;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className={clsx("transition-[padding] duration-300", sidebarOpen && "pr-[400px]")}>
        <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-8 px-6 pb-16 pt-10">
          <header className="flex items-center justify-between gap-6 rounded-[28px] border border-[var(--stroke)] bg-white/80 px-8 py-5 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Kanban Studio
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)]">
                  My Board
                </h1>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                  {board.columns.length} columns
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary-blue)]" />
                  {totalCards} cards
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {error && (
                <p className="text-xs font-semibold text-red-500" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label="Toggle AI sidebar"
                className={clsx(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition",
                  sidebarOpen
                    ? "bg-[var(--navy-dark)] hover:opacity-80"
                    : "bg-[var(--secondary-purple)] hover:brightness-110"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 1 7.38 16.75" />
                  <path d="M12 2a10 10 0 0 0-7.38 16.75" />
                  <path d="M12 22v-4" />
                  <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                </svg>
                AI
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => { setActiveCardId(null); setOverColumnId(null); }}
          >
            <section className="flex gap-5 overflow-x-auto pb-2">
              {board.columns.map((column) => (
                <div key={column.id} className="w-72 flex-none">
                  <KanbanColumn
                    column={column}
                    cards={column.cardIds.map((cardId) => board.cards[cardId]).filter((c): c is NonNullable<typeof c> => c != null)}
                    isOver={overColumnId === column.id}
                    onRename={handleRenameColumn}
                    onRenameBlur={handleRenameColumnBlur}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                  />
                </div>
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-64">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      </div>

      {sidebarOpen && (
        <AISidebar onMutation={handleAIMutation} onClose={() => setSidebarOpen(false)} />
      )}
    </div>
  );
};
