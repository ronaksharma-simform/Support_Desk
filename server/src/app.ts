import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { config } from "./config";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { ticketsRouter } from "./routes/tickets";
import { HttpError } from "./utils";

const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  if (config.corsOrigin === "*") {
    app.use(cors());
  } else {
    const origins = config.corsOrigin.split(",").map((s) => s.trim());
    app.use(cors({ origin: origins, credentials: true }));
  }

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "supportdesk-api", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { message: "API route not found" } });
  });

  // Serve the built client from the API when client/dist exists.
  if (existsSync(path.join(CLIENT_DIST, "index.html"))) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { message: err.message, code: err.code } });
      return;
    }
    const candidate = err as { type?: string } | null;
    if (candidate && candidate.type === "entity.parse.failed") {
      res.status(400).json({ error: { message: "Invalid JSON body" } });
      return;
    }
    console.error("[error]", err);
    res.status(500).json({ error: { message: "Internal server error" } });
  };
  app.use(errorHandler);

  return app;
}
