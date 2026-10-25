// Vercel Function: vercel.json sends every path here, and it serves them with the same handler as `pnpm demo`.
// The snapshot ships with the deploy (vercel.json includeFiles); events go to Vercel's log because the disk is read-only.
import { join } from "node:path";
import { createHandler } from "../dist/server/app.js";
import { avalai } from "../dist/server/llm.js";

const key = process.env.AVALAI_API_KEY;
export default createHandler(join(process.cwd(), "data/snapshots/latest.sqlite"), {
  llm: key ? avalai(key, process.env.AVALAI_MODEL || undefined) : null,
  eventsFile: null,
  trustProxy: true,
});
