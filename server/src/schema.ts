import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPool } from "./db";

const SCHEMA_PATH = fileURLToPath(new URL("../db/schema.sql", import.meta.url));

/** Apply the (idempotent) schema. */
export async function ensureSchema(): Promise<void> {
  const sql = await readFile(SCHEMA_PATH, "utf8");
  await getPool().query(sql);
}
