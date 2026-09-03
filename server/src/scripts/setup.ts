import { closePool } from "../db";
import { ensureSchema } from "../schema";

async function main(): Promise<void> {
  await ensureSchema();
  console.log("SupportDesk schema is up to date.");
}

main()
  .catch((err) => {
    console.error("Failed to set up the schema:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
