import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { hashPassword } from "./auth";
import { checkConnection, closePool, execute, queryRow } from "./db";
import type { Role } from "./domain";
import { ensureSchema } from "./schema";

// ---------------------------------------------------------------------------
// The integration suite requires PostgreSQL (DATABASE_URL points at the
// supportdesk_test database created by docker/initdb). When no database
// answers, the suite is skipped so `npm test` still exits cleanly on machines
// without Postgres.
// ---------------------------------------------------------------------------

const UNIQ = Date.now().toString(36);
const PASSWORD = "Password123!";
const emailOf = (prefix: string) => `${prefix}-${UNIQ}@example.test`;

const dbReady = await (async () => {
  try {
    if (!(await checkConnection())) return false;
    await ensureSchema();
    return true;
  } catch {
    return false;
  }
})();

let baseUrl = "";
let server: Server | null = null;
const ticketIds: string[] = [];
const userIds: string[] = [];
const tokens: Record<string, string> = {};

interface ApiResult {
  status: number;
  body: Record<string, any>;
}

async function api(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, body };
}

async function makeUser(role: Role, email: string, fullName = "Test User"): Promise<string> {
  const row = await queryRow<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, await hashPassword(PASSWORD), fullName, role]
  );
  userIds.push(row!.id);
  return row!.id;
}

async function login(email: string): Promise<{ token: string; user: any }> {
  const res = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  expect(res.status).toBe(200);
  tokens[email] = res.body.token as string;
  return { token: res.body.token as string, user: res.body.user };
}

const ADMIN_EMAIL = emailOf("admin");
const C1_EMAIL = emailOf("customer1");
const C2_EMAIL = emailOf("customer2");
const AGENT_A = emailOf("agent-a");
const AGENT_B = emailOf("agent-b");
const AGENT_C = emailOf("agent-c");

if (!dbReady) {
  console.warn(
    "[app.test] No reachable PostgreSQL database (DATABASE_URL) - skipping integration tests."
  );
}

describe.skipIf(!dbReady)("SupportDesk API", () => {
  beforeAll(async () => {
    await makeUser("admin", ADMIN_EMAIL, "Test Admin");
    await makeUser("support_agent", AGENT_A, "Agent A");
    await makeUser("support_agent", AGENT_B, "Agent B");
    await makeUser("support_agent", AGENT_C, "Agent C");

    server = createApp().listen(0);
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
  }, 30000);

  afterAll(async () => {
    if (dbReady) {
      if (ticketIds.length > 0) {
        await execute(`DELETE FROM ticket_messages WHERE ticket_id = ANY($1::uuid[])`, [ticketIds]);
        await execute(`DELETE FROM ticket_status_history WHERE ticket_id = ANY($1::uuid[])`, [ticketIds]);
        await execute(`DELETE FROM tickets WHERE id = ANY($1::uuid[])`, [ticketIds]);
      }
      if (userIds.length > 0) {
        await execute(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      }
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await closePool();
  }, 30000);

  // --- Health & auth -------------------------------------------------------

  it("GET /api/health responds ok", async () => {
    const res = await api("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("signs a customer up, logs in, and exposes /me", async () => {
    const signup = await api("POST", "/api/auth/signup", {
      body: { fullName: "Customer One", email: C1_EMAIL, password: PASSWORD },
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.role).toBe("customer");
    expect(typeof signup.body.token).toBe("string");
    userIds.push(signup.body.user.id as string);
    tokens[C1_EMAIL] = signup.body.token;

    const bad = await api("POST", "/api/auth/login", {
      body: { email: C1_EMAIL, password: "wrong-password" },
    });
    expect(bad.status).toBe(401);

    const { token } = await login(C1_EMAIL);
    const me = await api("GET", "/api/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(C1_EMAIL);
  });

  it("rejects duplicate signups and weak passwords", async () => {
    const dup = await api("POST", "/api/auth/signup", {
      body: { fullName: "Another", email: C1_EMAIL, password: PASSWORD },
    });
    expect(dup.status).toBe(409);

    const weak = await api("POST", "/api/auth/signup", {
      body: { fullName: "Weak", email: emailOf("weak"), password: "short" },
    });
    expect(weak.status).toBe(400);
  });

  it("requires a token for protected endpoints", async () => {
    const res = await api("GET", "/api/tickets");
    expect(res.status).toBe(401);
  });

  // --- Customers: create & isolation --------------------------------------

  it("lets a customer create a ticket (open, unassigned)", async () => {
    const c1 = await api("POST", "/api/tickets", {
      token: tokens[C1_EMAIL],
      body: {
        title: "Overcharged on invoice",
        description: "Please look into the duplicate charge on my latest invoice.",
        priority: "high",
        category: "billing",
      },
    });
    expect(c1.status).toBe(201);
    expect(c1.body.ticket.status).toBe("open");
    expect(c1.body.ticket.assigneeId).toBeNull();
    expect(c1.body.ticket.customerName).toBe("Customer One");
    ticketIds.push(c1.body.ticket.id as string);
  });

  it("only shows customers their own tickets", async () => {
    const c2signup = await api("POST", "/api/auth/signup", {
      body: { fullName: "Customer Two", email: C2_EMAIL, password: PASSWORD },
    });
    expect(c2signup.status).toBe(201);
    userIds.push(c2signup.body.user.id as string);
    tokens[C2_EMAIL] = c2signup.body.token;

    const mine = await api("GET", "/api/tickets", { token: tokens[C1_EMAIL] });
    expect(mine.status).toBe(200);
    expect(mine.body.tickets.length).toBeGreaterThan(0);

    const other = await api("GET", "/api/tickets", { token: tokens[C2_EMAIL] });
    expect(other.body.tickets.length).toBe(0);

    const firstId = mine.body.tickets[0].id as string;
    const peek = await api("GET", `/api/tickets/${firstId}`, { token: tokens[C2_EMAIL] });
    expect(peek.status).toBe(404);
  });

  it("forbids customers from the staff queue and from internal notes", async () => {
    const queue = await api("GET", "/api/tickets/queue", { token: tokens[C1_EMAIL] });
    expect(queue.status).toBe(403);

    const first = await api("GET", "/api/tickets", { token: tokens[C1_EMAIL] });
    const firstId = first.body.tickets[0].id as string;
    const note = await api("POST", `/api/tickets/${firstId}/notes`, {
      token: tokens[C1_EMAIL],
      body: { body: "internal only" },
    });
    expect(note.status).toBe(403);
  });

  // --- Staff queue, claiming, lifecycle -----------------------------------

  it("shows unclaimed open tickets to agents with priority sorting", async () => {
    const agent = await login(AGENT_A);

    const c2 = await api("POST", "/api/tickets", {
      token: tokens[C2_EMAIL],
      body: {
        title: "Urgent: payments failing",
        description: "Every payment attempt returns a generic failure.",
        priority: "urgent",
        category: "billing",
      },
    });
    ticketIds.push(c2.body.ticket.id as string);

    const queue = await api("GET", "/api/tickets/queue", { token: agent.token });
    expect(queue.status).toBe(200);
    expect(queue.body.tickets.length).toBe(2);

    const byPriority = await api("GET", "/api/tickets/queue?sort=priority", {
      token: agent.token,
    });
    expect(byPriority.body.tickets[0].priority).toBe("urgent");
  });

  it("lets an agent view, claim and see a queue ticket under My Tickets", async () => {
    const agent = await login(AGENT_A);
    const byPriority = await api("GET", "/api/tickets/queue?sort=priority", {
      token: agent.token,
    });
    const target = byPriority.body.tickets[0];

    // Agents may preview the unclaimed ticket (no notes) before claiming.
    const preview = await api("GET", `/api/tickets/${target.id}`, { token: agent.token });
    expect(preview.status).toBe(200);
    expect(preview.body.canManage).toBe(false);

    const claim = await api("PATCH", `/api/tickets/${target.id}/claim`, { token: agent.token });
    expect(claim.status).toBe(200);

    const again = await api("PATCH", `/api/tickets/${target.id}/claim`, { token: agent.token });
    expect(again.status).toBe(409);

    const myTickets = await api("GET", "/api/tickets", { token: agent.token });
    expect(myTickets.body.tickets.map((t: any) => t.id)).toContain(target.id);

    const queue = await api("GET", "/api/tickets/queue", { token: agent.token });
    expect(queue.body.tickets.map((t: any) => t.id)).not.toContain(target.id);
  });

  it("enforces one-step-forward transitions and reason-required reopening", async () => {
    const agent = await login(AGENT_A);
    const my = await api("GET", "/api/tickets", { token: agent.token });
    const ticketId = my.body.tickets[0].id as string;

    const step1 = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "in_progress" },
    });
    expect(step1.status).toBe(200);
    expect(step1.body.ticket.status).toBe("in_progress");

    const skip = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "closed" },
    });
    expect(skip.status).toBe(400);

    const backNoReason = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "open" },
    });
    expect(backNoReason.status).toBe(400);

    const step2 = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "resolved" },
    });
    expect(step2.status).toBe(200);

    const step3 = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "closed" },
    });
    expect(step3.status).toBe(200);

    const reopen = await api("PATCH", `/api/tickets/${ticketId}/status`, {
      token: agent.token,
      body: { status: "open", reason: "Customer reported the issue again" },
    });
    expect(reopen.status).toBe(200);
    expect(reopen.body.ticket.status).toBe("open");

    const detail = await api("GET", `/api/tickets/${ticketId}`, { token: agent.token });
    expect(detail.body.history.length).toBeGreaterThanOrEqual(4);
    const last = detail.body.history[detail.body.history.length - 1];
    expect(last.reason).toBe("Customer reported the issue again");
  });

  it("keeps internal notes invisible to customers while showing replies", async () => {
    const agent = await login(AGENT_A);
    const admin = await login(ADMIN_EMAIL);
    const customer = await login(C1_EMAIL);

    const mine = await api("GET", "/api/tickets", { token: customer.token });
    const ticketId = mine.body.tickets[0].id as string;

    const assignA = await api("PATCH", `/api/tickets/${ticketId}/assign`, {
      token: admin.token,
      body: { assigneeId: agent.user.id },
    });
    expect(assignA.status).toBe(200);

    const agentReply = await api("POST", `/api/tickets/${ticketId}/replies`, {
      token: agent.token,
      body: { body: "We are looking into the duplicate charge now." },
    });
    expect(agentReply.status).toBe(201);

    const internal = await api("POST", `/api/tickets/${ticketId}/notes`, {
      token: agent.token,
      body: { body: "INTERNAL: escalate to billing ops team." },
    });
    expect(internal.status).toBe(201);

    const asCustomer = await api("GET", `/api/tickets/${ticketId}`, { token: customer.token });
    const kinds = asCustomer.body.messages.map((m: any) => m.kind);
    expect(kinds).toContain("reply");
    expect(kinds).not.toContain("note");

    const asAgent = await api("GET", `/api/tickets/${ticketId}`, { token: agent.token });
    const agentKinds = asAgent.body.messages.map((m: any) => m.kind);
    expect(agentKinds).toContain("note");
  });

  it("keeps other agents out until the ticket is assigned to them", async () => {
    const agentB = await login(AGENT_B);
    const admin = await login(ADMIN_EMAIL);
    const mine = await api("GET", "/api/tickets", { token: tokens[C1_EMAIL] });
    const ticketId = mine.body.tickets[0].id as string;

    // The ticket is not unclaimed/open (agent A owns it) so agent B gets 404.
    const peek = await api("GET", `/api/tickets/${ticketId}`, { token: agentB.token });
    expect(peek.status).toBe(404);

    const assign = await api("PATCH", `/api/tickets/${ticketId}/assign`, {
      token: admin.token,
      body: { assigneeId: agentB.user.id },
    });
    expect(assign.status).toBe(200);

    const now = await api("GET", `/api/tickets/${ticketId}`, { token: agentB.token });
    expect(now.status).toBe(200);

    const customerAssign = await api("PATCH", `/api/tickets/${ticketId}/assign`, {
      token: tokens[C1_EMAIL],
      body: { assigneeId: agentB.user.id },
    });
    expect(customerAssign.status).toBe(403);
  });

  // --- Admin: agent management, reassignment, dashboards -------------------

  it("lets admins invite agents (temporary password) and deactivate them", async () => {
    const admin = await login(ADMIN_EMAIL);
    const invitedEmail = emailOf("invited");

    const invite = await api("POST", "/api/admin/agents", {
      token: admin.token,
      body: { fullName: "Invited Agent", email: invitedEmail },
    });
    expect(invite.status).toBe(201);
    expect(typeof invite.body.temporaryPassword).toBe("string");
    expect(invite.body.agent.role).toBe("support_agent");
    userIds.push(invite.body.agent.id as string);

    const res = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invitedEmail, password: invite.body.temporaryPassword }),
    });
    expect(res.status).toBe(200);

    const list = await api("GET", "/api/admin/agents", { token: admin.token });
    expect(list.body.agents.map((a: any) => a.email)).toContain(invitedEmail);

    const deactivate = await api("PATCH", `/api/admin/agents/${invite.body.agent.id}`, {
      token: admin.token,
      body: { isActive: false },
    });
    expect(deactivate.status).toBe(200);

    const blockedLogin = await api("POST", "/api/auth/login", {
      body: { email: invitedEmail, password: invite.body.temporaryPassword },
    });
    expect(blockedLogin.status).toBe(403);
  });

  it("rejects assignments to deactivated agents", async () => {
    const admin = await login(ADMIN_EMAIL);
    const invitedEmail = emailOf("invited2");
    const invite = await api("POST", "/api/admin/agents", {
      token: admin.token,
      body: { fullName: "Invited Two", email: invitedEmail, password: PASSWORD },
    });
    userIds.push(invite.body.agent.id as string);

    await api("PATCH", `/api/admin/agents/${invite.body.agent.id}`, {
      token: admin.token,
      body: { isActive: false },
    });

    const ticket = await api("POST", "/api/tickets", {
      token: tokens[C2_EMAIL],
      body: {
        title: "Must not land with deactivated agent",
        description: "Target agent is inactive, this should be rejected.",
        priority: "low",
        category: "other",
      },
    });
    ticketIds.push(ticket.body.ticket.id as string);

    const assign = await api("PATCH", `/api/tickets/${ticket.body.ticket.id}/assign`, {
      token: admin.token,
      body: { assigneeId: invite.body.agent.id },
    });
    expect(assign.status).toBe(400);
  });

  it("lets admins reassign between agents and return tickets to the queue", async () => {
    const admin = await login(ADMIN_EMAIL);
    const agentA = await login(AGENT_A);
    const agentB = await login(AGENT_B);

    const fresh = await api("POST", "/api/tickets", {
      token: tokens[C1_EMAIL],
      body: {
        title: "Reassign me please",
        description: "This ticket exists to exercise the reassign flow.",
        priority: "medium",
        category: "account",
      },
    });
    ticketIds.push(fresh.body.ticket.id as string);
    const targetId = fresh.body.ticket.id as string;

    const toA = await api("PATCH", `/api/tickets/${targetId}/assign`, {
      token: admin.token,
      body: { assigneeId: agentA.user.id },
    });
    expect(toA.status).toBe(200);

    const asA = await api("GET", "/api/tickets", { token: agentA.token });
    expect(asA.body.tickets.map((t: any) => t.id)).toContain(targetId);

    const toB = await api("PATCH", `/api/tickets/${targetId}/assign`, {
      token: admin.token,
      body: { assigneeId: agentB.user.id },
    });
    expect(toB.status).toBe(200);

    const asB = await api("GET", "/api/tickets", { token: agentB.token });
    expect(asB.body.tickets.map((t: any) => t.id)).toContain(targetId);

    const backToQueue = await api("PATCH", `/api/tickets/${targetId}/assign`, {
      token: admin.token,
      body: { assigneeId: null },
    });
    expect(backToQueue.status).toBe(200);

    const queueAgain = await api("GET", "/api/tickets/queue", { token: admin.token });
    expect(queueAgain.body.tickets.map((t: any) => t.id)).toContain(targetId);
  });

  it("supports admin filters on the all-tickets view", async () => {
    const admin = await login(ADMIN_EMAIL);
    const all = await api("GET", "/api/tickets", { token: admin.token });
    expect(all.body.tickets.length).toBeGreaterThan(0);

    const filtered = await api("GET", "/api/tickets?status=open&priority=urgent", {
      token: admin.token,
    });
    for (const t of filtered.body.tickets) {
      expect(t.status).toBe("open");
      expect(t.priority).toBe("urgent");
    }
  });

  it("returns admin dashboard analytics", async () => {
    const admin = await login(ADMIN_EMAIL);
    const res = await api("GET", "/api/dashboard", { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("admin");
    expect(res.body.summary.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.volumeByDay)).toBe(true);
    expect(Array.isArray(res.body.perAgent)).toBe(true);
    expect(res.body.avgResolutionHours === null || typeof res.body.avgResolutionHours === "number").toBe(true);
  });

  it("returns a personal dashboard for support agents", async () => {
    const agent = await login(AGENT_A);
    const res = await api("GET", "/api/dashboard", { token: agent.token });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("agent");
    expect(typeof res.body.summary.total).toBe("number");
    expect(res.body.byPriority).toMatchObject({
      low: expect.any(Number),
      medium: expect.any(Number),
      high: expect.any(Number),
      urgent: expect.any(Number),
    });
  });

  it("does not let customers reach the dashboard", async () => {
    const res = await api("GET", "/api/dashboard", { token: tokens[C1_EMAIL] });
    expect(res.status).toBe(403);
  });
});
