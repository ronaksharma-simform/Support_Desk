import bcrypt from "bcryptjs";
import { closePool, execute, queryRow } from "../db";
import { ensureSchema } from "../schema";

/**
 * Seeds a small, realistic demo dataset so every role has data to work with.
 * NOTE: db:seed RESETS the database (wipes all rows) - dev/demo only.
 */

const PASSWORD = "Password123!";

function daysAgo(days: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface SeedUser {
  email: string;
  fullName: string;
  role: "customer" | "support_agent" | "admin";
  isActive: boolean;
}

const USERS: SeedUser[] = [
  { email: "admin@supportdesk.dev", fullName: "Dana Sterling", role: "admin", isActive: true },
  { email: "alice@supportdesk.dev", fullName: "Alice Rivera", role: "support_agent", isActive: true },
  { email: "bob@supportdesk.dev", fullName: "Bob Chen", role: "support_agent", isActive: true },
  { email: "carol@supportdesk.dev", fullName: "Carol Osei", role: "support_agent", isActive: false },
  { email: "sam@supportdesk.dev", fullName: "Sam Carter", role: "customer", isActive: true },
  { email: "jordan@supportdesk.dev", fullName: "Jordan Lee", role: "customer", isActive: true },
];

interface TicketSeed {
  customer: "sam" | "jordan";
  assignee?: "alice" | "bob" | "admin";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: "billing" | "technical" | "account" | "other";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdDaysAgo: number;
  createdHour: number;
  resolvedDaysAgo?: number;
}

const TICKETS: TicketSeed[] = [
  { customer: "sam", priority: "urgent", category: "billing", title: "Double charge on my monthly plan",
    description: "I was charged twice for this month: once on the 1st and again on the 3rd. Both transactions show as pending in my bank. Can someone reverse the duplicate?",
    status: "open", createdDaysAgo: 0, createdHour: 1 },
  { customer: "jordan", priority: "high", category: "technical", title: "Cannot upload attachments over 5 MB",
    description: "The attachment widget fails with 'file too large' for a 6 MB PDF even though the plan page says 10 MB is allowed. Using Chrome 126 on macOS.",
    status: "open", createdDaysAgo: 1, createdHour: 6 },
  { customer: "sam", priority: "medium", category: "account", title: "Want to update my company name",
    description: "Our company rebranded and the account still shows the old legal name. Please update it to Acme Digital Services Ltd.",
    status: "open", createdDaysAgo: 2, createdHour: 12 },
  { customer: "jordan", priority: "low", category: "other", title: "Feature request: CSV export",
    description: "It would save my team hours if we could export the dashboard data as CSV. Is this on the roadmap?",
    status: "open", createdDaysAgo: 5, createdHour: 10 },
  { customer: "sam", assignee: "alice", priority: "high", category: "technical", title: "Login page times out at peak hours",
    description: "Between 9 and 11 AM the login request often times out. Our office is in Lisbon and the team cannot get in. Started three days ago.",
    status: "in_progress", createdDaysAgo: 4, createdHour: 9 },
  { customer: "jordan", assignee: "bob", priority: "urgent", category: "billing", title: "Invoice PDF shows wrong VAT amount",
    description: "Invoice #2203 for last month shows 23% VAT but our rate is 21%. Accounting needs a corrected PDF by Friday.",
    status: "in_progress", createdDaysAgo: 0, createdHour: 8 },
  { customer: "sam", assignee: "alice", priority: "medium", category: "account", title: "Team seats not syncing after upgrade",
    description: "We upgraded from 5 to 10 seats but the members page still caps invites at 5. The payment went through immediately.",
    status: "in_progress", createdDaysAgo: 6, createdHour: 15 },
  { customer: "jordan", assignee: "bob", priority: "low", category: "technical", title: "Dark mode resets after refresh",
    description: "Toggling dark mode works until the page is refreshed, then it reverts to light. Looks like a localStorage issue?",
    status: "resolved", createdDaysAgo: 8, createdHour: 11, resolvedDaysAgo: 7 },
  { customer: "sam", assignee: "alice", priority: "high", category: "billing", title: "Refund for unused annual plan",
    description: "We downgraded to monthly in July but were still charged for the full annual amount. Requesting a refund of the difference.",
    status: "resolved", createdDaysAgo: 10, createdHour: 9, resolvedDaysAgo: 9 },
  { customer: "jordan", assignee: "bob", priority: "medium", category: "account", title: "Access for a former teammate still active",
    description: "A developer who left last month still appears in the audit log. Please deactivate the account and confirm when done.",
    status: "closed", createdDaysAgo: 12, createdHour: 13, resolvedDaysAgo: 10 },
  { customer: "sam", assignee: "alice", priority: "urgent", category: "technical", title: "Outage - API returning 503s",
    description: "All API calls from our integration server started returning 503 at 07:40 UTC. Our production checkout flow is down.",
    status: "closed", createdDaysAgo: 13, createdHour: 8, resolvedDaysAgo: 12 },
  { customer: "jordan", assignee: "bob", priority: "medium", category: "billing", title: "Payment method update failed",
    description: "Tried to replace the saved card on file with a new corporate card; the form keeps rejecting it with a generic error. Card is verified fine.",
    status: "open", createdDaysAgo: 1, createdHour: 19 },
];

async function main(): Promise<void> {
  await ensureSchema();
  console.log("[seed] Applying schema, resetting demo data...");

  await execute(
    `TRUNCATE ticket_status_history, ticket_messages, tickets, users RESTART IDENTITY CASCADE`
  );

  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids: Record<string, string> = {};

  for (const u of USERS) {
    const row = await queryRow<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [u.email, hash, u.fullName, u.role, u.isActive]
    );
    ids[u.email] = row!.id;
    console.log(`[seed] user  ${u.email} (${u.role})`);
  }

  for (const t of TICKETS) {
    const created = daysAgo(t.createdDaysAgo, t.createdHour);
    const assignee = t.assignee ? ids[`${t.assignee}@supportdesk.dev`] : null;
    const resolved =
      t.status === "resolved" || t.status === "closed"
        ? t.resolvedDaysAgo !== undefined
          ? daysAgo(t.resolvedDaysAgo, 16)
          : created
        : null;

    const inserted = await queryRow<{ id: string }>(
      `INSERT INTO tickets
        (customer_id, assignee_id, title, description, priority, category, status,
         resolved_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        ids[`${t.customer}@supportdesk.dev`],
        assignee,
        t.title,
        t.description,
        t.priority,
        t.category,
        t.status,
        resolved,
        created,
        created,
      ]
    );
    const ticketId = inserted!.id;
    console.log(`[seed] ticket ${t.status.padEnd(11)} ${t.priority.padEnd(6)} ${t.title}`);

    await execute(
      `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, reason, changed_by, created_at)
       VALUES ($1, NULL, 'open', NULL, $2, $3)`,
      [ticketId, ids[`${t.customer}@supportdesk.dev`], created]
    );

    const agentId = assignee ?? ids["alice@supportdesk.dev"];
    if (t.status === "in_progress" || t.status === "resolved" || t.status === "closed") {
      const claimedAt = new Date(created.getTime() + 2 * 3600 * 1000);
      await execute(
        `UPDATE tickets SET updated_at = $2 WHERE id = $1`, [ticketId, claimedAt]
      );
      await execute(
        `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, reason, changed_by, created_at)
         VALUES ($1, 'open', 'in_progress', NULL, $2, $3)`,
        [ticketId, agentId, claimedAt]
      );
    }
    if (t.status === "resolved" || t.status === "closed") {
      await execute(
        `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, reason, changed_by, created_at)
         VALUES ($1, 'in_progress', 'resolved', NULL, $2, $3)`,
        [ticketId, agentId, resolved]
      );
    }
    if (t.status === "closed") {
      const closedAt = new Date((resolved ?? created).getTime() + 36 * 3600 * 1000);
      await execute(
        `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, reason, changed_by, created_at)
         VALUES ($1, 'resolved', 'closed', 'Closed after customer confirmation', $2, $3)`,
        [ticketId, ids["admin@supportdesk.dev"], closedAt]
      );
      await execute(`UPDATE tickets SET updated_at = $2 WHERE id = $1`, [ticketId, closedAt]);
    }

    // A scripted conversation on a few handled tickets.
    if (t.title.includes("503s") || t.title.includes("VAT") || t.title.includes("seats")) {
      const author = ids[`${t.customer}@supportdesk.dev`];
      const t1 = new Date(created.getTime() + 30 * 60 * 1000);
      const t2 = new Date(created.getTime() + 3 * 3600 * 1000);
      await execute(
        `INSERT INTO ticket_messages (ticket_id, author_id, kind, body, created_at)
         VALUES ($1, $2, 'reply', $3, $4)`,
        [ticketId, author,
          "Thanks for the report - I have attached the relevant logs and screenshots. Let me know if you need anything else from our side.", t1]
      );
      await execute(
        `INSERT INTO ticket_messages (ticket_id, author_id, kind, body, created_at)
         VALUES ($1, $2, 'reply', $3, $4)`,
        [ticketId, agentId,
          "Thanks, we have reproduced this on our end and the team is on it. I will update you here as soon as we have a fix.", t2]
      );
      await execute(
        `INSERT INTO ticket_messages (ticket_id, author_id, kind, body, created_at)
         VALUES ($1, $2, 'note', $3, $4)`,
        [ticketId, agentId,
          "Internal: escalate to the platform squad if not resolved by EOD. Customer is a priority account.", t2]
      );
    }
  }

  console.log("\n[seed] Demo data ready. All demo accounts use password: " + PASSWORD);
  console.log("  admin@supportdesk.dev   (admin)");
  console.log("  alice@supportdesk.dev   (support agent)");
  console.log("  bob@supportdesk.dev     (support agent)");
  console.log("  sam@supportdesk.dev     (customer)");
  console.log("  jordan@supportdesk.dev  (customer)");
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
