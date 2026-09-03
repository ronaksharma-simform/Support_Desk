import { Router } from "express";
import { requireAuth, requireRoles } from "../auth";
import { queryRow, queryRows } from "../db";
import type { TicketPriority } from "../domain";
import { asyncHandler } from "../utils";

/**
 * Role-aware dashboard:
 *  * Admin: whole-company analytics (volume over time, average resolution
 *    time, tickets per agent, status breakdown).
 *  * Support agent: personal workload (status breakdown of tickets assigned
 *    to them, their average resolution time, open workload by priority).
 */

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.use(requireRoles("support_agent", "admin"));

interface SummaryRow {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  total: number;
}

interface VolumeRow {
  date: string;
  count: number;
}

interface AvgRow {
  avgResolutionHours: number | null;
}

interface PerAgentRow {
  agentId: string;
  agentName: string;
  total: number;
  open: number;
  resolved: number;
}

const SUMMARY_ALL = `
  SELECT
    COUNT(*) FILTER (WHERE status = 'open')::int AS "open",
    COUNT(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
    COUNT(*) FILTER (WHERE status = 'resolved')::int AS "resolved",
    COUNT(*) FILTER (WHERE status = 'closed')::int AS "closed",
    COUNT(*)::int AS "total"
  FROM tickets
`;

const SUMMARY_AGENT = `
  SELECT
    COUNT(*) FILTER (WHERE status = 'open')::int AS "open",
    COUNT(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
    COUNT(*) FILTER (WHERE status = 'resolved')::int AS "resolved",
    COUNT(*) FILTER (WHERE status = 'closed')::int AS "closed",
    COUNT(*)::int AS "total"
  FROM tickets WHERE assignee_id = $1
`;

const AVG_ALL = `
  SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::float8
         AS "avgResolutionHours"
    FROM tickets WHERE resolved_at IS NOT NULL
`;

const AVG_AGENT = `
  SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::float8
         AS "avgResolutionHours"
    FROM tickets WHERE resolved_at IS NOT NULL AND assignee_id = $1
`;

const VOLUME_14D = `
  WITH days AS (
    SELECT generate_series(
             date_trunc('day', now()) - interval '13 days',
             date_trunc('day', now()),
             interval '1 day'
           )::date AS day
  )
  SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(t.id)::int AS count
    FROM days d
    LEFT JOIN tickets t ON t.created_at::date = d.day
   GROUP BY d.day
   ORDER BY d.day
`;

const PER_AGENT = `
  SELECT u.id AS "agentId", u.full_name AS "agentName",
         COUNT(t.id)::int AS "total",
         COUNT(t.id) FILTER (WHERE t.status IN ('open','in_progress'))::int AS "open",
         COUNT(t.id) FILTER (WHERE t.status IN ('resolved','closed'))::int AS "resolved"
    FROM users u
    LEFT JOIN tickets t ON t.assignee_id = u.id
   WHERE u.role = 'support_agent' AND u.is_active
   GROUP BY u.id, u.full_name
   ORDER BY COUNT(t.id) DESC, u.full_name
`;

type PriorityCounts = Record<TicketPriority, number>;

async function priorityCounts(agentId: string): Promise<PriorityCounts> {
  const rows = await queryRows<{ priority: TicketPriority; count: number }>(
    `SELECT priority, COUNT(*)::int AS count
       FROM tickets
      WHERE assignee_id = $1 AND status IN ('open', 'in_progress')
      GROUP BY priority`,
    [agentId]
  );
  const out: PriorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 };
  for (const r of rows) out[r.priority] = r.count;
  return out;
}

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (user.role === "admin") {
      const [summary, volumeByDay, avg, perAgent] = await Promise.all([
        queryRow<SummaryRow>(SUMMARY_ALL),
        queryRows<VolumeRow>(VOLUME_14D),
        queryRow<AvgRow>(AVG_ALL),
        queryRows<PerAgentRow>(PER_AGENT),
      ]);
      res.json({
        scope: "admin",
        summary,
        volumeByDay,
        avgResolutionHours: avg?.avgResolutionHours ?? null,
        perAgent,
      });
      return;
    }

    const [summary, avg, byPriority] = await Promise.all([
      queryRow<SummaryRow>(SUMMARY_AGENT, [user.id]),
      queryRow<AvgRow>(AVG_AGENT, [user.id]),
      priorityCounts(user.id),
    ]);
    res.json({
      scope: "agent",
      summary,
      avgResolutionHours: avg?.avgResolutionHours ?? null,
      byPriority,
    });
  })
);
