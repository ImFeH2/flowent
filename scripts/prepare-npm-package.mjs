import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = join(root, "dist");
const standalone = join(root, ".next", "standalone");
const staticAssets = join(root, ".next", "static");
const publicAssets = join(root, "public");

if (!existsSync(join(standalone, "server.js"))) {
  console.error(
    "Next.js standalone output was not found. Run pnpm build first.",
  );
  process.exit(1);
}

await rm(dist, { recursive: true, force: true });
await cp(standalone, dist, { recursive: true });
await rm(join(dist, "node_modules"), { recursive: true, force: true });
await mkdir(join(dist, ".next"), { recursive: true });
await cp(staticAssets, join(dist, ".next", "static"), { recursive: true });

if (existsSync(publicAssets)) {
  await cp(publicAssets, join(dist, "public"), { recursive: true });
}
