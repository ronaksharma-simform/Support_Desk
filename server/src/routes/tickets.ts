import { Router } from "express";
import { requireAuth, requireRoles } from "../auth";
import { execute, queryRow, queryRows } from "../db";
import type {
  MessageKind,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../domain";
import { CATEGORIES, PRIORITIES, STATUSES, isStaffRole } from "../domain";
import { assertTransition, transitionRules } from "../ticketRules";
import {
  HttpError,
  asyncHandler,
  isUuid,
  optionalText,
  requireEnum,
  requireText,
} from "../utils";

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Row shapes (SQL aliases -> camelCase DTOs)
// ---------------------------------------------------------------------------

interface TicketListItemRow {
  id: string;
  number: number;
  title: string;
  priority: TicketPriority;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  customerId: string;
  customerName: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

interface TicketDetailRow extends TicketListItemRow {
  description: string;
  resolvedAt: Date | null;
}

interface AccessRow {
  id: string;
  customerId: string;
  assigneeId: string | null;
  status: TicketStatus;
}

interface MessageRow {
  id: string;
  kind: MessageKind;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorRole: Role;
}

interface HistoryRow {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  reason: string | null;
  createdAt: Date;
  changedByName: string;
}

const LIST_COLUMNS = `
  t.id,
  t.number::int AS number,
  t.title,
  t.priority,
  t.category,
  t.status,
  t.created_at AS "createdAt",
  t.updated_at AS "updatedAt",
  t.customer_id AS "customerId",
  c.full_name AS "customerName",
  t.assignee_id AS "assigneeId",
  a.full_name AS "assigneeName"
`;

const LIST_FROM = `
  FROM tickets t
  JOIN users c ON c.id = t.customer_id
  LEFT JOIN users a ON a.id = t.assignee_id
`;

const QUEUE_SORTS: Record<string, string> = {
  age: `ORDER BY t.created_at ASC`,
  newest: `ORDER BY t.created_at DESC`,
  priority: `ORDER BY (CASE t.priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2
        WHEN 'medium' THEN 1 ELSE 0 END) DESC, t.created_at ASC`,
};

const LIST_SORTS: Record<string, string> = {
  recent: `ORDER BY t.created_at DESC`,
  oldest: `ORDER BY t.created_at ASC`,
  updated: `ORDER BY t.updated_at DESC`,
};

// ---------------------------------------------------------------------------
// Access control helpers
// ---------------------------------------------------------------------------

/** Admins can act on any ticket; agents only on tickets assigned to them. */
function isAssignedStaff(user: { id: string; role: Role }, assigneeId: string | null): boolean {
  if (user.role === "admin") return true;
  return user.role === "support_agent" && assigneeId === user.id;
}

async function loadAccessRow(ticketId: string): Promise<AccessRow | null> {
  return queryRow<AccessRow>(
    `SELECT id, customer_id AS "customerId", assignee_id AS "assigneeId", status
       FROM tickets WHERE id = $1`,
    [ticketId]
  );
}

function notFound(): never {
  throw new HttpError(404, "Ticket not found");
}

// ---------------------------------------------------------------------------
// POST /api/tickets - create a ticket (requester becomes the customer)
// ---------------------------------------------------------------------------

ticketsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = req.body ?? {};
    const title = requireText(body.title, "Title", 160, 3);
    const description = requireText(body.description, "Description", 20000);
    const priority = requireEnum<TicketPriority>(
      body.priority ?? "medium",
      PRIORITIES,
      "Priority"
    );
    const category = requireEnum<TicketCategory>(
      body.category ?? "other",
      CATEGORIES,
      "Category"
    );

    const inserted = await queryRow<TicketListItemRow>(
      `INSERT INTO tickets (customer_id, title, description, priority, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, number::int AS number, title, priority, category, status,
                 created_at AS "createdAt", updated_at AS "updatedAt",
                 $1::uuid AS "customerId", $6 AS "customerName",
                 NULL::uuid AS "assigneeId", NULL::text AS "assigneeName"`,
      [user.id, title, description, priority, category, user.fullName]
    );
    res.status(201).json({ ticket: inserted });
  })
);

// ---------------------------------------------------------------------------
// GET /api/tickets/queue - unclaimed open tickets (staff only)
// ---------------------------------------------------------------------------

ticketsRouter.get(
  "/queue",
  requireRoles("support_agent", "admin"),
  asyncHandler(async (req, res) => {
    const sort = QUEUE_SORTS[String(req.query.sort ?? "age")];
    if (!sort) throw new HttpError(400, "sort must be one of: age, newest, priority");
    const rows = await queryRows<TicketListItemRow>(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM}
       WHERE t.status = 'open' AND t.assignee_id IS NULL
       ${sort}`
    );
    res.json({ tickets: rows });
  })
);

// ---------------------------------------------------------------------------
// GET /api/tickets - role-scoped ticket lists
//   customer      -> their own tickets
//   support_agent -> tickets assigned to them
//   admin         -> every ticket, with filters (status/priority/agent/dates)
// ---------------------------------------------------------------------------

ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const sortSql = LIST_SORTS[String(req.query.sort ?? "recent")] ?? LIST_SORTS.recent;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (user.role === "customer") {
      conditions.push("t.customer_id = $1");
      params.push(user.id);
    } else if (user.role === "support_agent") {
      conditions.push("t.assignee_id = $1");
      params.push(user.id);
    } else {
      const push = (clause: string, value: unknown) => {
        params.push(value);
        conditions.push(`${clause} $${params.length}`);
      };
      const status = req.query.status;
      if (typeof status === "string" && status !== "") {
        if (!STATUSES.includes(status as TicketStatus)) {
          throw new HttpError(400, "Invalid status filter");
        }
        push("t.status =", status);
      }
      const priority = req.query.priority;
      if (typeof priority === "string" && priority !== "") {
        if (!PRIORITIES.includes(priority as TicketPriority)) {
          throw new HttpError(400, "Invalid priority filter");
        }
        push("t.priority =", priority);
      }
      const agentId = req.query.agentId;
      if (typeof agentId === "string" && agentId !== "") {
        if (!isUuid(agentId)) throw new HttpError(400, "Invalid agent id");
        push("t.assignee_id =", agentId);
      }
      const from = req.query.from;
      if (typeof from === "string" && from !== "") {
        push("t.created_at >=", `${from}T00:00:00.000Z`);
      }
      const to = req.query.to;
      if (typeof to === "string" && to !== "") {
        push("t.created_at <=", `${to}T23:59:59.999Z`);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await queryRows<TicketListItemRow>(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM} ${where} ${sortSql}`
    );
    res.json({ tickets: rows });
  })
);

// ---------------------------------------------------------------------------
// GET /api/tickets/:id - full detail.
// Visible to: the owning customer, assigned staff/admin, and any staff member
// previewing an unclaimed OPEN ticket from the shared queue.
// Customers only ever receive replies. Internal notes are visible only to the
// assigned staff/admin (they stay hidden even from agents queue-previewing).
// ---------------------------------------------------------------------------

ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await queryRow<TicketDetailRow>(
      `SELECT ${LIST_COLUMNS}, t.description, t.resolved_at AS "resolvedAt"
       ${LIST_FROM} WHERE t.id = $1`,
      [id]
    );
    if (!ticket) notFound();

    const staff = isStaffRole(user.role);
    const assigned = staff && isAssignedStaff(user, ticket.assigneeId);
    const unclaimedPreview =
      staff && ticket.assigneeId === null && ticket.status === "open";
    if (!(ticket.customerId === user.id || assigned || unclaimedPreview)) notFound();

    // Fully privileged staff (assignee/admin) see internal notes; customers
    // and agents merely previewing the queue do not.
    const kindFilter: MessageKind[] =
      user.role === "customer" || !assigned ? ["reply"] : ["reply", "note"];

    const messages = await queryRows<MessageRow>(
      `SELECT m.id, m.kind, m.body, m.created_at AS "createdAt",
              m.author_id AS "authorId", u.full_name AS "authorName",
              u.role AS "authorRole"
         FROM ticket_messages m
         JOIN users u ON u.id = m.author_id
        WHERE m.ticket_id = $1 AND m.kind = ANY($2::text[])
        ORDER BY m.created_at ASC`,
      [id, kindFilter]
    );

    const history = await queryRows<HistoryRow>(
      `SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus",
              h.reason, h.created_at AS "createdAt", u.full_name AS "changedByName"
         FROM ticket_status_history h
         JOIN users u ON u.id = h.changed_by
        WHERE h.ticket_id = $1
        ORDER BY h.created_at ASC`,
      [id]
    );

    res.json({
      ticket,
      messages,
      history,
      canManage: assigned,
      transitions: assigned ? transitionRules(ticket.status) : [],
    });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/claim - staff claims an unclaimed open ticket
// ---------------------------------------------------------------------------

ticketsRouter.patch(
  "/:id/claim",
  requireRoles("support_agent", "admin"),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await loadAccessRow(id);
    if (!ticket) notFound();
    if (ticket.status !== "open" || ticket.assigneeId !== null) {
      throw new HttpError(409, "Only unclaimed open tickets can be claimed");
    }

    await execute(`UPDATE tickets SET assignee_id = $1 WHERE id = $2`, [user.id, id]);
    await execute(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [id]);
    res.json({ message: "Ticket claimed" });
  })
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:id/replies - customer-visible message.
// Allowed for the owning customer, or the assigned agent / an admin.
// ---------------------------------------------------------------------------

ticketsRouter.post(
  "/:id/replies",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await loadAccessRow(id);
    if (!ticket) notFound();
    const mayReply = ticket.customerId === user.id || isAssignedStaff(user, ticket.assigneeId);
    if (!mayReply) {
      if (user.role === "support_agent") {
        throw new HttpError(403, "Only the assigned agent (or an admin) can reply to this ticket");
      }
      notFound();
    }

    const body = requireText(req.body?.body, "Message", 4000);
    const message = await insertMessage(id, user.id, "reply", body);
    res.status(201).json({ message });
  })
);

// ---------------------------------------------------------------------------
// POST /api/tickets/:id/notes - internal note (assigned staff/admin only)
// ---------------------------------------------------------------------------

ticketsRouter.post(
  "/:id/notes",
  requireRoles("support_agent", "admin"),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await loadAccessRow(id);
    if (!ticket) notFound();
    if (!isAssignedStaff(user, ticket.assigneeId)) {
      if (user.role === "support_agent") {
        throw new HttpError(403, "Only the assigned agent (or an admin) can add internal notes");
      }
      notFound();
    }

    const body = requireText(req.body?.body, "Note", 4000);
    const message = await insertMessage(id, user.id, "note", body);
    res.status(201).json({ message });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/status - lifecycle transition (one step forward,
// or backwards WITH a recorded reason). Assigned staff/admin only.
// ---------------------------------------------------------------------------

ticketsRouter.patch(
  "/:id/status",
  requireRoles("support_agent", "admin"),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await loadAccessRow(id);
    if (!ticket) notFound();
    if (!isAssignedStaff(user, ticket.assigneeId)) {
      if (user.role === "support_agent") {
        throw new HttpError(403, "Only the assigned agent (or an admin) can change this ticket");
      }
      notFound();
    }

    const nextStatus = requireEnum<TicketStatus>(req.body?.status, STATUSES, "Status");
    const reason = optionalText(req.body?.reason, 500);
    const { requiresReason } = assertTransition(ticket.status, nextStatus, reason);

    const resolvedAtSql =
      nextStatus === "resolved"
        ? `CASE WHEN resolved_at IS NULL THEN now() ELSE resolved_at END`
        : nextStatus === "open" || nextStatus === "in_progress"
          ? "NULL"
          : "resolved_at";

    await execute(
      `UPDATE tickets SET status = $1, resolved_at = ${resolvedAtSql} WHERE id = $2`,
      [nextStatus, id]
    );
    await execute(
      `INSERT INTO ticket_status_history
        (ticket_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, ticket.status, nextStatus, requiresReason ? reason?.trim() || "" : null, user.id]
    );

    const fresh = await queryRow<TicketDetailRow>(
      `SELECT ${LIST_COLUMNS}, t.description, t.resolved_at AS "resolvedAt"
       ${LIST_FROM} WHERE t.id = $1`,
      [id]
    );
    res.json({ ticket: fresh });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/assign - reassign / unassign (admin only)
// ---------------------------------------------------------------------------

ticketsRouter.patch(
  "/:id/assign",
  requireRoles("admin"),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid ticket id");

    const ticket = await loadAccessRow(id);
    if (!ticket) notFound();
    if (ticket.status === "closed") {
      throw new HttpError(400, "Closed tickets cannot be reassigned");
    }

    const rawAssignee = req.body?.assigneeId ?? null;
    if (rawAssignee !== null && typeof rawAssignee !== "string") {
      throw new HttpError(400, "assigneeId must be an agent id or null");
    }

    if (rawAssignee === null) {
      if (ticket.status !== "open") {
        throw new HttpError(
          400,
          "Unassign only makes sense while the ticket is open; reassign it to another agent instead"
        );
      }
      await execute(`UPDATE tickets SET assignee_id = NULL WHERE id = $1`, [id]);
      await execute(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [id]);
      res.json({ message: "Ticket returned to the queue" });
      return;
    }

    if (!isUuid(rawAssignee)) throw new HttpError(400, "Invalid agent id");
    const target = await queryRow<{ id: string }>(
      `SELECT id FROM users
        WHERE id = $1 AND role IN ('support_agent', 'admin') AND is_active`,
      [rawAssignee]
    );
    if (!target) throw new HttpError(400, "Assignee must be an active agent");

    await execute(`UPDATE tickets SET assignee_id = $1 WHERE id = $2`, [rawAssignee, id]);
    await execute(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [id]);
    res.json({ message: "Ticket reassigned" });
  })
);

// ---------------------------------------------------------------------------

async function insertMessage(
  ticketId: string,
  authorId: string,
  kind: MessageKind,
  body: string
): Promise<MessageRow> {
  const inserted = await queryRow<{ id: string }>(
    `INSERT INTO ticket_messages (ticket_id, author_id, kind, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ticketId, authorId, kind, body]
  );
  await execute(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [ticketId]);
  const full = await queryRow<MessageRow>(
    `SELECT m.id, m.kind, m.body, m.created_at AS "createdAt",
            m.author_id AS "authorId", u.full_name AS "authorName",
            u.role AS "authorRole"
       FROM ticket_messages m
       JOIN users u ON u.id = m.author_id
      WHERE m.id = $1`,
    [inserted!.id]
  );
  if (!full) throw new HttpError(500, "Failed to load created message");
  return full;
}
