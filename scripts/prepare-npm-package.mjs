import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = join(root, "dist");
const frontendDist = join(root, "frontend", "dist");

if (!existsSync(join(frontendDist, "index.html"))) {
  console.error("Frontend build output was not found. Run pnpm build first.");
  process.exit(1);
}

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "frontend"), { recursive: true });
await cp(frontendDist, join(dist, "frontend"), { recursive: true });
