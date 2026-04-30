# Database

SQLite, created automatically on first startup if it does not exist.

## File location

Inside the Docker container: `/app/kanban.db`

For persistence across container restarts, mount a volume in `docker-compose.yml`:
```yaml
volumes:
  - ./data:/app/data
```
And set the DB path to `/app/data/kanban.db` in the backend config (Part 6).

## Schema

### users
| Column        | Type    | Constraints          |
|---------------|---------|----------------------|
| id            | INTEGER | PK, autoincrement    |
| username      | TEXT    | NOT NULL, UNIQUE     |
| password_hash | TEXT    | NOT NULL             |

Seeded on first startup with one hardcoded user (`user` / `password`).
Stored as a bcrypt hash. Schema supports multiple users for future expansion.

### boards
| Column  | Type    | Constraints              |
|---------|---------|--------------------------|
| id      | INTEGER | PK, autoincrement        |
| user_id | INTEGER | NOT NULL, FK → users.id  |
| name    | TEXT    | NOT NULL, default "My Board" |

One board per user for the MVP. The schema supports multiple boards per user in future.

### columns
| Column   | Type    | Constraints               |
|----------|---------|---------------------------|
| id       | TEXT    | PK (e.g. "col-backlog")   |
| board_id | INTEGER | NOT NULL, FK → boards.id  |
| title    | TEXT    | NOT NULL                  |
| position | INTEGER | NOT NULL                  |

Five fixed columns seeded per board. `position` determines display order (0-indexed).
String IDs are used so the existing frontend `data-testid` values work without changes.

### cards
| Column    | Type    | Constraints                |
|-----------|---------|----------------------------|
| id        | TEXT    | PK (e.g. "card-abc123")    |
| column_id | TEXT    | NOT NULL, FK → columns.id  |
| title     | TEXT    | NOT NULL                   |
| details   | TEXT    | NOT NULL, default ""       |
| position  | INTEGER | NOT NULL                   |

`position` is the card's index within its column (0-indexed). When a card moves,
positions of affected cards in the source and target columns are recomputed.

## Relationships

```
users (1) ──< boards (1) ──< columns (5) ──< cards (many)
```

## Design decisions

- **SQLite** — zero-config, file-based, sufficient for a single-user local MVP.
- **String IDs for columns and cards** — matches the existing frontend identifiers so no migration of testids is needed.
- **Integer IDs for users and boards** — auto-increment is natural for server-generated entities.
- **`position` column** — avoids linked-list complexity; simple integer sort. Recomputed on move.
- **No soft deletes** — MVP scope; cards and columns are hard-deleted.
