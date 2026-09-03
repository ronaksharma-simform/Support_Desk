# SupportDesk

A full-stack support ticket helpdesk with three user roles — **Customer**, **Support Agent**, and **Admin** — built from scratch.

| Layer    | Stack |
| -------- | ----- |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS (workspace `client/`) |
| Backend  | Node.js + Express + TypeScript (workspace `server/`) |
| Database | PostgreSQL 16 (`docker compose up db`) |
| Tests    | Vitest (unit + API integration) |

## Features

### Customers
- Sign up / log in (role `customer`).
- Submit a ticket: title, description, priority (`low | medium | high | urgent`), category (`billing | technical | account | other`).
- List their own tickets with current status.
- Open a ticket to see the full detail: replies, status history, timestamps.
- Reply to a ticket (customer-visible).

### Support agents
- Personal dashboard (status breakdown, open workload by priority, average resolution time).
- Shared queue of unclaimed open tickets, sortable by **oldest first / highest priority / newest first**.
- Claim a ticket (assigns it to themselves) straight from the queue or the ticket page.
- **My Tickets** view — everything assigned to them.
- Update ticket status (`open → in_progress → resolved → closed`) — always exactly one step forward; reopening requires a recorded reason.
- Reply to a ticket (customer-visible) **and** add internal notes (staff-only, never returned to the customer).

### Admins
Everything an agent can do, plus:
- See **all tickets** across every agent with filters: status, priority, agent, and created date range.
- Reassign tickets between agents, or return an open ticket to the queue.
- Manage agent accounts: invite (with a generated temporary password) and activate/deactivate.
- Team dashboard: ticket volume over time (last 14 days), average resolution time, tickets per agent, and an open vs resolved breakdown.

## Rules implemented
- **No hard deletes** — ticket history is permanent (`RESTRICT` foreign keys; only status changes).
- **Status moves forward in order**, one step at a time, with no skipping; any backward move (reopen) **requires a reason**, which is stored in the status history.
- **Customers never see other customers' tickets** (404 for anything not theirs) or internal notes.

Out of scope (per the task brief): live chat, AI-suggested replies, SLA auto-escalation, multi-language support.

## Quick start

Requirements: Node 18+, Docker (for Postgres).

```bash
# 1. Install everything (npm workspaces)
npm install

# 2. Start PostgreSQL and create the dev + test databases
npm run db:up

# 3. Apply the schema and load demo data
npm run db:seed        # wipes and reseeds the dev database

# 4. Run both servers (API on :4000, web on :5173, /api proxied)
npm run dev
```

Open http://localhost:5173 — you land on the login page.

### Demo accounts (password `Password123!` for all)

| Email | Role |
| --- | --- |
| `admin@supportdesk.dev` | Admin |
| `alice@supportdesk.dev` | Support agent |
| `bob@supportdesk.dev` | Support agent |
| `sam@supportdesk.dev` | Customer |
| `jordan@supportdesk.dev` | Customer |

## Tests & checks

```bash
npm test          # server unit + integration tests (skips cleanly when no DB is reachable)
npm run typecheck # tsc for server and client workspaces
npm run build     # production build of the client
```

Integration tests expect PostgreSQL on `localhost:5432` with a `supportdesk_test`
database (created automatically by `docker/initdb/01-create-test-db.sql`). Point
`DATABASE_URL_TEST` at another instance to override.

## Project layout

```
├── client/                 # React + Vite + Tailwind web app
│   └── src/
│       ├── pages/          # role pages (auth, tickets, queue, dashboard, agents)
│       ├── components/     # layout, badges, tables, UI primitives
│       ├── auth/           # AuthProvider + session (localStorage JWT)
│       ├── hooks/          # useAsyncData
│       └── lib/            # api client, types, formatters
├── server/                 # Express API
│   ├── db/schema.sql       # idempotent PostgreSQL schema
│   └── src/
│       ├── routes/         # auth, tickets, admin, dashboard
│       ├── scripts/        # db:setup / db:seed
│       └── *.test.ts       # lifecycle unit tests + API integration tests
└── docker-compose.yml      # PostgreSQL 16 (+ initdb test DB)
```

## API overview

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | public | Create a customer account |
| POST | `/api/auth/login` | public | Sign in → JWT + user |
| GET | `/api/auth/me` | any | Current profile |
| POST | `/api/tickets` | any | Create a ticket |
| GET | `/api/tickets` | customer / agent / admin | Own / assigned / all (filtered) tickets |
| GET | `/api/tickets/queue?sort=` | staff | Unclaimed open tickets |
| GET | `/api/tickets/:id` | scoped | Full detail + messages + history |
| PATCH | `/api/tickets/:id/claim` | staff | Claim an unclaimed ticket |
| POST | `/api/tickets/:id/replies` | owner / assignee | Customer-visible reply |
| POST | `/api/tickets/:id/notes` | assignee / admin | Internal note |
| PATCH | `/api/tickets/:id/status` | assignee / admin | Lifecycle transition |
| PATCH | `/api/tickets/:id/assign` | admin | Reassign / return to queue |
| GET/POST | `/api/admin/agents` | admin | List / invite agents |
| PATCH | `/api/admin/agents/:id` | admin | Activate / deactivate |
| GET | `/api/dashboard` | staff | Role-aware analytics |

Authentication is a `Bearer` JWT stored in `localStorage`. Every request is
authorized server-side against the current database row, so deactivated accounts
lose access immediately.
