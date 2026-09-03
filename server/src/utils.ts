import { randomBytes } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function requireText(
  value: unknown,
  label: string,
  maxLength: number,
  minLength = 1
): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required`);
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw new HttpError(400, `${label} must be at least ${minLength} characters`);
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${label} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
  return trimmed;
}

export function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requireEmail(value: unknown): string {
  const email = requireText(value, "Email", 255).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new HttpError(400, "Please provide a valid email address");
  }
  return email;
}

export function randomTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}
