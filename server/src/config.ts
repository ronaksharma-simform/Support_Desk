import dotenv from "dotenv";

dotenv.config();

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function fromEnvInt(name: string, fallback: number): number {
  const value = Number.parseInt(fromEnv(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: fromEnvInt("PORT", 4000),
  databaseUrl: fromEnv(
    "DATABASE_URL",
    "postgres://supportdesk:supportdesk@localhost:5432/supportdesk"
  ),
  jwtSecret: fromEnv("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: fromEnv("JWT_EXPIRES_IN", "7d"),
  corsOrigin: fromEnv("CORS_ORIGIN", "http://localhost:5173"),
};
