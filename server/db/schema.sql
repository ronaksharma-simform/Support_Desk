-- ============================================================================
-- SupportDesk schema (PostgreSQL >= 13, idempotent - safe to re-run)
-- Domain rules implemented here and mirrored in application code:
--   * No hard deletes - ticket history is permanent (FKs use RESTRICT).
--   * users.role drives all authorization (customer | support_agent | admin).
--   * tickets.status moves forward in order: open -> in_progress ->
--     resolved -> closed (enforced in the API; backward moves need a reason
--     recorded in ticket_status_history.reason).
--   * ticket_messages.kind distinguishes customer-visible replies from
--     agent/admin-only internal notes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'support_agent', 'admin')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number       BIGSERIAL NOT NULL UNIQUE,
  customer_id  UUID NOT NULL REFERENCES users(id),
  assignee_id  UUID REFERENCES users(id),
  title        VARCHAR(160) NOT NULL,
  description  TEXT NOT NULL,
  priority     VARCHAR(10) NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category     VARCHAR(12) NOT NULL DEFAULT 'other'
               CHECK (category IN ('billing', 'technical', 'account', 'other')),
  status       VARCHAR(12) NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_created  ON tickets (created_at);

-- Ticket conversation: replies are customer-visible; notes are staff-only.
CREATE TABLE IF NOT EXISTS ticket_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  author_id  UUID NOT NULL REFERENCES users(id),
  kind       VARCHAR(8) NOT NULL CHECK (kind IN ('reply', 'note')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages (ticket_id, created_at);

-- Append-only record of every status change (plus the reason, when required).
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  from_status VARCHAR(12),
  to_status   VARCHAR(12) NOT NULL,
  reason      TEXT,
  changed_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_ticket ON ticket_status_history (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_tickets_updated ON tickets;
CREATE TRIGGER trg_tickets_updated
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
