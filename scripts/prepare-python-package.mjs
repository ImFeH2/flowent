import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const frontendDist = join(root, "frontend", "dist");
const backendStatic = join(root, "backend", "src", "flowent", "static");

if (!existsSync(join(frontendDist, "index.html"))) {
  console.error(
    "Frontend build output was not found. Run pnpm build:frontend first.",
  );
  process.exit(1);
}

await import("./prepare-python-readme.mjs");

await rm(backendStatic, { recursive: true, force: true });
await mkdir(backendStatic, { recursive: true });
await cp(frontendDist, backendStatic, { recursive: true });
