import { Router } from "express";
import { hashPassword, requireAuth, requireRoles } from "../auth";
import { execute, queryRow, queryRows } from "../db";
import {
  HttpError,
  asyncHandler,
  isUuid,
  randomTemporaryPassword,
  requireEmail,
  requireText,
} from "../utils";

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireRoles("admin"));

interface AgentRow {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  openCount: number;
  closedCount: number;
  totalCount: number;
}

const AGENT_LIST_SQL = `
  SELECT u.id, u.email, u.full_name AS "fullName",
         u.is_active AS "isActive", u.created_at AS "createdAt",
         COUNT(t.id) FILTER (WHERE t.status IN ('open','in_progress'))::int AS "openCount",
         COUNT(t.id) FILTER (WHERE t.status IN ('resolved','closed'))::int AS "closedCount",
         COUNT(t.id)::int AS "totalCount"
    FROM users u
    LEFT JOIN tickets t ON t.assignee_id = u.id
   WHERE u.role = 'support_agent'
   GROUP BY u.id
   ORDER BY u.created_at DESC
`;

/** GET /api/admin/agents - every support agent with workload counts. */
adminRouter.get(
  "/agents",
  asyncHandler(async (_req, res) => {
    const agents = await queryRows<AgentRow>(AGENT_LIST_SQL);
    res.json({ agents });
  })
);

/**
 * POST /api/admin/agents - "invite" an agent.
 * Accepts an optional password; otherwise generates a temporary one and returns
 * it once in the response (there is no mailer in this demo).
 */
adminRouter.post(
  "/agents",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const fullName = requireText(body.fullName, "Full name", 120, 2);
    const email = requireEmail(body.email);

    let password = body.password;
    let temporaryPassword: string | undefined;
    if (password === undefined || password === null || password === "") {
      temporaryPassword = randomTemporaryPassword();
      password = temporaryPassword;
    } else if (typeof password !== "string" || password.length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters");
    }

    const existing = await queryRow<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    if (existing) throw new HttpError(409, "A user with this email already exists");

    const passwordHash = await hashPassword(password);
    const user = await queryRow<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      isActive: boolean;
    }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'support_agent')
       RETURNING id, email, full_name AS "fullName", role, is_active AS "isActive"`,
      [email, passwordHash, fullName]
    );
    if (!user) throw new HttpError(500, "Could not create agent");

    res.status(201).json({ agent: user, temporaryPassword });
  })
);

/** PATCH /api/admin/agents/:id - activate / deactivate an agent. */
adminRouter.patch(
  "/agents/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid agent id");
    if (id === req.user!.id) {
      throw new HttpError(400, "You cannot deactivate your own account");
    }

    const isActive = req.body?.isActive;
    if (typeof isActive !== "boolean") {
      throw new HttpError(400, "isActive must be true or false");
    }

    const agent = await queryRow<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND role = 'support_agent'`,
      [id]
    );
    if (!agent) throw new HttpError(404, "Agent not found");

    await execute(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive, id]);
    res.json({ agent: { id, isActive } });
  })
);
