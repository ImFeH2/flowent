# Autopoe

A multi-agent collaboration framework where lightweight AI agents work together through structured coordination to accomplish complex software development tasks.

## Installation

Pick one:

```bash
uvx autopoe                       # run without installing
uv tool install autopoe           # install via uv
pip install autopoe               # install via pip
```

To run from source, see [Development](#development).

## Prerequisites

- **[Bubblewrap](https://github.com/containers/bubblewrap)** (`bwrap`) — required for agents to execute shell commands in a sandboxed environment. Install it before running Autopoe if you want agents to be able to run code.

## Configuration

On first run, configure your LLM provider via the Settings panel (gear icon). Four API types are supported — any compatible endpoint works:

- **OpenAI-compatible** — OpenRouter, Ollama, ModelScope, vLLM, LiteLLM, or any `/v1/chat/completions` endpoint
- **OpenAI Responses** — OpenAI or compatible `/v1/responses` endpoints
- **Anthropic** — any endpoint following the Anthropic Messages API
- **Google Gemini** — any endpoint following the Gemini `generateContent` API

Settings are saved to `settings.json` and can be changed at runtime without restarting.

## Development

```bash
# Clone the repo
git clone https://github.com/ImFeH2/autopoe.git
cd autopoe

# Backend (hot reload)
uv sync
uv run fastapi dev app/main.py

# Frontend (hot reload, separate terminal)
cd frontend
pnpm install
pnpm dev
```
