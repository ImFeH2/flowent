<p align="center">
  <img src="./assets/flowent-banner.png" alt="Flowent" width="720" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flowent"><img src="https://img.shields.io/npm/v/flowent.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/ImFeH2/flowent/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/flowent.svg?style=flat-square" alt="License" /></a>
  <a href="https://github.com/ImFeH2/flowent/actions/workflows/ci.yml"><img src="https://github.com/ImFeH2/flowent/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ImFeH2/flowent/actions/workflows/release.yml"><img src="https://github.com/ImFeH2/flowent/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://github.com/ImFeH2/flowent/actions/workflows/docker-publish.yml"><img src="https://github.com/ImFeH2/flowent/actions/workflows/docker-publish.yml/badge.svg" alt="Docker" /></a>
</p>

# Flowent

A workflow orchestration platform for multi-agent collaboration.

## Install

Install the CLI globally:

```bash
npm install -g flowent
```

Start the server:

```bash
flowent
```

## Docker Compose

Run the server with Docker Compose:

```bash
docker compose up
```

## Technology Stack

- Next.js: application framework and server runtime.
- React: UI rendering model.
- Tailwind CSS: utility-first styling.
- Shadcn UI: standard component patterns.
- Lucide Icons: shared icon set.
- Framer Motion: advanced interaction and transition animation.

## Development

Install dependencies and start the local development server:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:6873`.

You can also run the development container:

```bash
docker compose -f docker-compose.dev.yml up
```
