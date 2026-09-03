import { Router } from "express";
import { hashPassword, requireAuth, signToken, verifyPassword } from "../auth";
import { queryRow } from "../db";
import type { Role } from "../domain";
import { HttpError, asyncHandler, requireEmail, requireText } from "../utils";

export const authRouter = Router();

interface UserRowLite {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

const COLS = `id, email, full_name AS "fullName", role, is_active AS "isActive"`;

/** POST /api/auth/signup - public signup; always creates a Customer. */
authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const fullName = requireText(body.fullName, "Full name", 120, 2);
    const email = requireEmail(body.email);
    const password = requireText(body.password, "Password", 200, 8);

    const existing = await queryRow<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await queryRow<UserRowLite>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING ${COLS}`,
      [email, passwordHash, fullName]
    );
    if (!user) throw new HttpError(500, "Could not create account");

    res.status(201).json({
      token: signToken({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      }),
      user,
    });
  })
);

/** POST /api/auth/login */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const email = requireEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    const user = await queryRow<UserRowLite & { passwordHash: string }>(
      `SELECT ${COLS}, password_hash AS "passwordHash" FROM users WHERE email = $1`,
      [email]
    );
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    if (!user.isActive) {
      throw new HttpError(
        403,
        "This account has been deactivated. Contact your administrator."
      );
    }

    const safe: UserRowLite = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
    };
    res.json({ token: signToken(safe), user: safe });
  })
);

/** GET /api/auth/me - fresh profile for the current token. */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const fresh = await queryRow<UserRowLite>(
      `SELECT ${COLS} FROM users WHERE id = $1`,
      [user.id]
    );
    if (!fresh) throw new HttpError(401, "Account no longer exists");
    res.json({ user: fresh });
  })
);
