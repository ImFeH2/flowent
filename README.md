# Autopoe

A multi-agent collaboration framework where lightweight AI agents work together through structured coordination to accomplish complex software development tasks.

## Installation

Pick one:

```bash
uvx autopoe                       # run without installing
uv tool install autopoe           # install via uv
pip install autopoe               # install via pip
```

## Docker

To run Autopoe in Docker, download `docker-compose.yml` and run:

```bash
docker compose up -d
```

Autopoe will be available at `http://localhost:6873`.

## Prerequisites

- **[Bubblewrap](https://github.com/containers/bubblewrap)** (`bwrap`) — required for agents to execute shell commands in a sandboxed environment. Install it before running Autopoe if you want agents to be able to run code.

## Configuration

On first run, configure your LLM provider via the Settings panel (gear icon). Four API types are supported — any compatible endpoint works:

- **OpenAI-compatible** — OpenRouter, Ollama, ModelScope, vLLM, LiteLLM, or any `/v1/chat/completions` endpoint
- **OpenAI Responses** — OpenAI or compatible `/v1/responses` endpoints
- **Anthropic** — any endpoint following the Anthropic Messages API
- **Google Gemini** — any endpoint following the Gemini `generateContent` API

Autopoe stores instance data in `~/.autopoe/` by default, including `settings.json`, workspace snapshots, and image assets.
You can override that app data directory before startup with `AUTOPOE_APP_DATA_DIR=/path/to/data` or `autopoe --app-data-dir /path/to/data`.
The system `working_dir` can be changed at runtime from Settings without restarting.

## Development

```bash
# Clone the repo
git clone https://github.com/ImFeH2/autopoe.git
cd autopoe

# Backend (API + WebSocket only, http://localhost:8000)
uv sync
uv run fastapi dev app/dev.py

# Frontend (hot reload, http://localhost:6873, separate terminal)
cd frontend
pnpm install
pnpm dev
```

In development, open `http://localhost:6873`. The Vite dev server proxies `/api` and `/ws` to the backend on `http://localhost:8000`. In production, the backend serves the built frontend from `app/static` on `http://localhost:6873`.
