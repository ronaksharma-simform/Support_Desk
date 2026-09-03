import { createApp } from "./app";
import { config } from "./config";
import { closePool } from "./db";
import { ensureSchema } from "./schema";

async function boot(): Promise<void> {
  try {
    await ensureSchema();
    console.log("[db] Schema is ready");
  } catch (err) {
    console.warn(
      "[db] Could not apply the schema yet (is Postgres running? run `docker compose up db`). " +
        "The API will keep running; run `npm run db:setup` once the database is available."
    );
    if (err instanceof Error) console.warn(`[db] ${err.message}`);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[api] SupportDesk API listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

boot().catch((err) => {
  console.error("[api] Fatal startup error", err);
  process.exit(1);
});
