import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";
import { handleOrderGet } from "../../envy-skin-clone/server/bridge.ts";

const envDir = join(process.cwd(), "envy-skin-clone");
if (existsSync(join(envDir, ".env"))) config({ path: join(envDir, ".env") });
if (existsSync(join(envDir, ".env.local"))) config({ path: join(envDir, ".env.local"), override: true });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
  const out = await handleOrderGet(orderId);
  res.status(out.status).json(out.body);
}
