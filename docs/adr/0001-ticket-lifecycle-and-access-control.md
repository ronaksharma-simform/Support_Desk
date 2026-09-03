# ADR-0001: Ticket lifecycle and access-control model

## Status

Accepted

## Context

SupportDesk is a three-role helpdesk (customer, support agent, admin) with two
hard product rules:

1. **No hard deletes** — ticket history is permanent; tickets only change status.
2. **Ticket status only moves forward in order** (open → in_progress → resolved →
   closed), and must never "skip backwards without reason".

We also had to decide how ticket data is shared: customers own their tickets,
agents work from a shared queue, and internal notes must never reach customers.

## Decision

### Data model
- Append-only tables: `ticket_messages` and `ticket_status_history` reference
  `tickets` with `ON DELETE RESTRICT` and there are no `DELETE` endpoints.
- `tickets.status` is a checked enum; `ticket_status_history` records every
  transition with `from_status`, `to_status`, `reason`, `changed_by`, timestamp.

### Lifecycle policy (`server/src/ticketRules.ts`)
- Statuses are a fixed ordered list. A transition is valid if it moves **exactly
  one step forward**, or **any number of steps backward** *with* a non-empty
  `reason` (persisted to history). Anything else (same status, multi-step
  forward) returns 400.
- The rule lives in one pure module with unit tests and is reused by the API;
  the schema keeps only the enum constraints.

### Access control (single server-side source of truth)
- Row-level checks are performed in the API for every ticket request against the
  current user row (never trusting the client or stale token claims):
  - **Owner** (the customer) may view their tickets, reply, and reopen via replies.
  - **Assigned staff** (the `assignee_id`) may view, reply, add internal notes,
    and change status. Admins count as assigned on every ticket.
  - Any staff member may **preview** an *unclaimed open* ticket (to browse the
    queue) but without internal notes and without management rights until they
    claim it.
  - Everyone else gets a 404 (tickets are not discoverable).
- Internal notes (`kind = 'note'`) are filtered out of every response a customer
  (or an unassigned agent previewing) receives; replies (`kind = 'reply'`) are
  the only customer-visible messages.

### Roles & provisioning
- Self-signup always creates a `customer`. Support agents are provisioned by
  admins ("invite"), which returns a one-time generated password because the
  demo has no mailer. Deactivation sets `is_active = false`; the auth middleware
  re-checks `is_active` on every request so tokens die immediately.

## Consequences
- Business rules are centralized and testable without a database (lifecycle
  module) plus end-to-end via API integration tests.
- The "unclaimed ticket preview" rule keeps the agent queue usable without
  weakening the "internal notes are secret" requirement.
- Future features (SLA timers, reopen notifications) can hang off
  `ticket_status_history` without schema churn.
