# Frontend

Next.js 16 app (React 19, TypeScript, Tailwind CSS v4). Pure frontend-only Kanban demo — no backend calls yet.

## Structure

```
src/
  app/
    layout.tsx          Root layout (sets font, global CSS)
    page.tsx            Entry point — renders <KanbanBoard />
    globals.css         CSS custom properties for the color scheme + Tailwind imports
  components/
    KanbanBoard.tsx     Top-level board: owns all state, wires DnD context
    KanbanColumn.tsx    Single column: droppable zone + sortable card list + rename input
    KanbanCard.tsx      Single card: sortable, shows title/details, delete button
    KanbanCardPreview.tsx  Drag overlay ghost (non-interactive clone shown while dragging)
    NewCardForm.tsx     Collapsible form inside each column for adding cards
    KanbanBoard.test.tsx  Vitest unit tests for board-level interactions
  lib/
    kanban.ts           Types (Card, Column, BoardData), initialData seed, moveCard logic, createId
    kanban.test.ts      Vitest unit tests for moveCard and createId
  test/
    setup.ts            Vitest global setup (jest-dom matchers)
    vitest.d.ts         Type augmentations for custom matchers
tests/
  kanban.spec.ts        Playwright e2e tests (load board, add card, drag card)
```

## State model

All state lives in `KanbanBoard` as a single `BoardData` object:

```ts
type BoardData = {
  columns: Column[];          // ordered list; order = visual order
  cards: Record<string, Card>; // keyed by card id for O(1) lookup
};
```

Columns hold an ordered `cardIds` array; the board derives card objects from that. `moveCard()` in `lib/kanban.ts` is a pure function — it handles same-column reorder and cross-column moves.

## Drag and drop

Uses `@dnd-kit/core` + `@dnd-kit/sortable`. Cards are `useSortable`; columns are `useDroppable`. A `DragOverlay` renders `KanbanCardPreview` while dragging. Collision strategy: `closestCorners`. Drag activation requires 6 px movement to avoid accidental drags on click.

## Color scheme (CSS custom properties in globals.css)

| Variable           | Value     | Usage                        |
|--------------------|-----------|------------------------------|
| `--accent-yellow`  | `#ecad0a` | Column accent bars, ring     |
| `--primary-blue`   | `#209dd7` | Links, key text              |
| `--purple-secondary` | `#753991` | Submit buttons               |
| `--navy-dark`      | `#032147` | Headings, card titles        |
| `--gray-text`      | `#888888` | Labels, supporting text      |

## Test commands

```bash
npm run test:unit      # vitest run (unit)
npm run test:e2e       # playwright test (requires dev server on :3000)
npm run test:all       # both
```

## Known limitations (pre-backend integration)

- All state is in-memory; lost on page refresh
- No authentication
- `initialData` in `lib/kanban.ts` is the only data source
