#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const backendProject = join(packageRoot, "backend");
const staticDirectory = join(packageRoot, "dist", "frontend");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

const args = process.argv.slice(2);
let port = process.env.PORT ?? "6873";
let hostname = process.env.HOSTNAME ?? "0.0.0.0";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--help" || arg === "-h") {
    console.log("Usage: flowent [--port <port>] [--hostname <host>]");
    process.exit(0);
  }

  if (arg === "--version" || arg === "-v") {
    console.log(packageJson.version);
    process.exit(0);
  }

  if ((arg === "--port" || arg === "-p") && args[index + 1]) {
    port = args[index + 1];
    index += 1;
    continue;
  }

  if ((arg === "--hostname" || arg === "--host") && args[index + 1]) {
    hostname = args[index + 1];
    index += 1;
  }
}

if (!existsSync(join(backendProject, "pyproject.toml"))) {
  console.error(
    "Flowent runtime is missing. Reinstall the package and try again.",
  );
  process.exit(1);
}

if (!existsSync(join(staticDirectory, "index.html"))) {
  console.error(
    "Flowent application files are missing. Reinstall the package and try again.",
  );
  process.exit(1);
}

const uvCommand = process.env.FLOWENT_UV_BINARY ?? "uv";
const child = spawn(
  uvCommand,
  ["run", "--project", backendProject, "flowent-api"],
  {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWENT_STATIC_DIR: staticDirectory,
      HOSTNAME: hostname,
      PORT: port,
    },
  },
);

child.on("error", (error) => {
  console.error(error.message);
  console.error("Install uv and try again: https://docs.astral.sh/uv/");
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }

  process.exit(code ?? 0);
});
