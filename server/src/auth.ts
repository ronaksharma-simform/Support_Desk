import bcrypt from "bcryptjs";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import type { AuthUser, Role } from "./domain";
import { queryRow } from "./db";
import { HttpError } from "./utils";

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// JWT issuing
// ---------------------------------------------------------------------------

interface TokenPayload {
  sub: string;
  role: Role;
  email: string;
  fullName: string;
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

// ---------------------------------------------------------------------------
// User rows
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export const USER_COLUMNS = `id, email, full_name AS "fullName", role, is_active AS "isActive"`;

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryRow<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Express auth middleware
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : undefined;
}

/** Verifies the Bearer token and loads a fresh, active user record. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) throw new HttpError(401, "Authentication required");
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    if (!payload?.sub) throw new HttpError(401, "Invalid or expired token");
    const user = await findUserById(payload.sub);
    if (!user || !user.isActive) {
      throw new HttpError(401, "Account is deactivated or no longer exists");
    }
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      next(err);
      return;
    }
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new HttpError(403, "You do not have permission to do this"));
      return;
    }
    next();
  };
}
