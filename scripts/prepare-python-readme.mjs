import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const rootReadme = join(root, "README.md");
const backendReadme = join(root, "backend", "README.md");

if (!existsSync(rootReadme)) {
  console.error("Root README was not found.");
  process.exit(1);
}

await rm(backendReadme, { force: true });
await cp(rootReadme, backendReadme);
