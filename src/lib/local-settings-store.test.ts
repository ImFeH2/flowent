import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getLocalSettingsPaths,
  parseLocalSettingsSnapshot,
  readLocalSettingsSnapshot,
  saveLocalSettingsSnapshot,
} from "./local-settings-store";

const temporaryRoots: string[] = [];

async function createHomeDirectory() {
  const homeDirectory = path.join(tmpdir(), `flowent-settings-${randomUUID()}`);
  await mkdir(homeDirectory, { recursive: true });
  temporaryRoots.push(homeDirectory);
  return homeDirectory;
}

function createSettingsSnapshot() {
  return {
    modelConnections: [
      {
        id: "connection-work-gateway",
        type: "openai",
        name: "Work gateway",
        accessKey: "saved-key",
        endpointUrl: "https://api.openai.com/v1",
      },
    ],
    modelPresets: [
      {
        id: "preset-writing",
        name: "Writing Model",
        modelConnectionId: "connection-work-gateway",
        modelName: "gpt-4o",
        temperature: 0.7,
        outputLimit: 1200,
        testStatus: "idle",
      },
    ],
    blueprints: [
      {
        id: "blueprint-launch",
        name: "Launch Campaign",
        updatedAt: "2026-04-27T09:00:00.000Z",
        lastRunStatus: "not-run",
        summary: "Draft launch copy.",
        nodes: [],
        edges: [],
        runHistory: [],
        selectedRunId: null,
      },
    ],
    roles: [
      {
        id: "role-writer",
        name: "Writer",
        avatar: "WR",
        systemPrompt: "Write a concise response.",
        modelPresetId: "preset-writing",
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.map((temporaryRoot) =>
      rm(temporaryRoot, { force: true, recursive: true }),
    ),
  );
  temporaryRoots.length = 0;
});

describe("local settings store", () => {
  it("stores settings in a stable file under the home folder", async () => {
    const homeDirectory = await createHomeDirectory();
    const settings = createSettingsSnapshot();

    await saveLocalSettingsSnapshot(settings, { homeDirectory });

    const { dataDirectory, settingsFile } = getLocalSettingsPaths({
      homeDirectory,
    });
    const fileContents = await readFile(settingsFile, "utf8");

    expect(dataDirectory).toBe(path.join(homeDirectory, ".flowent"));
    expect(JSON.parse(fileContents)).toMatchObject({
      version: 1,
      modelConnections: settings.modelConnections,
      modelPresets: settings.modelPresets,
      blueprints: settings.blueprints,
      roles: settings.roles,
    });
  });

  it("reads a previously saved settings snapshot", async () => {
    const homeDirectory = await createHomeDirectory();
    const settings = createSettingsSnapshot();

    await saveLocalSettingsSnapshot(settings, { homeDirectory });

    await expect(
      readLocalSettingsSnapshot({ homeDirectory }),
    ).resolves.toMatchObject({
      status: "found",
      settings: {
        modelConnections: settings.modelConnections,
        modelPresets: settings.modelPresets,
        blueprints: settings.blueprints,
        roles: settings.roles,
      },
    });
  });

  it("treats a missing settings file as an empty saved state", async () => {
    const homeDirectory = await createHomeDirectory();

    await expect(readLocalSettingsSnapshot({ homeDirectory })).resolves.toEqual(
      { status: "missing", settings: null },
    );
  });

  it("rejects settings with invalid connection or preset sections", () => {
    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [{ id: "connection-work-gateway" }],
        modelPresets: [],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [],
        modelPresets: [{ id: "preset-writing" }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("normalizes older saved connection settings", () => {
    expect(
      parseLocalSettingsSnapshot({
        providers: [
          {
            id: "provider-openai",
            type: "openai",
            name: "OpenAI Platform",
            apiKey: "saved-key",
            baseUrl: "https://api.openai.com/v1",
          },
        ],
        modelPresets: [
          {
            id: "preset-writing",
            name: "Writing Model",
            providerId: "provider-openai",
            modelId: "gpt-4o",
            temperature: 0.7,
            maxTokens: 1200,
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      settings: {
        modelConnections: [
          {
            id: "connection-openai",
            type: "openai",
            name: "OpenAI Platform",
            accessKey: "saved-key",
            endpointUrl: "https://api.openai.com/v1",
          },
        ],
        modelPresets: [
          {
            id: "preset-writing",
            modelConnectionId: "connection-openai",
            modelName: "gpt-4o",
            outputLimit: 1200,
          },
        ],
      },
    });
  });

  it("normalizes older blueprints that do not have run instances", () => {
    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [],
        modelPresets: [],
        blueprints: [
          {
            id: "blueprint-old",
            name: "Old Blueprint",
            updatedAt: "2026-04-27T09:00:00.000Z",
            lastRunStatus: "not-run",
            summary: "Saved before run instances.",
            nodes: [],
            edges: [],
          },
        ],
        roles: [],
      }),
    ).toMatchObject({
      ok: true,
      settings: {
        blueprints: [
          {
            runHistory: [],
            selectedRunId: null,
          },
        ],
      },
    });
  });

  it("accepts run instance statuses and normalizes older completed states", () => {
    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [],
        modelPresets: [],
        blueprints: [
          {
            id: "blueprint-runs",
            name: "Runs Blueprint",
            updatedAt: "2026-04-27T09:00:00.000Z",
            lastRunStatus: "running",
            summary: "Saved runs.",
            nodes: [],
            edges: [],
            runHistory: [
              {
                id: "run-queued",
                startedAt: "2026-04-27T10:00:00.000Z",
                updatedAt: "2026-04-27T10:00:00.000Z",
                status: "queued",
                summary: "Queued run.",
                nodes: [],
                edges: [],
              },
              {
                id: "run-failed",
                startedAt: "2026-04-27T10:01:00.000Z",
                updatedAt: "2026-04-27T10:02:00.000Z",
                status: "failed",
                summary: "Failed run.",
                nodes: [],
                edges: [],
              },
              {
                id: "run-canceled",
                startedAt: "2026-04-27T10:03:00.000Z",
                updatedAt: "2026-04-27T10:04:00.000Z",
                status: "canceled",
                summary: "Canceled run.",
                nodes: [],
                edges: [],
              },
              {
                id: "run-legacy-success",
                startedAt: "2026-04-27T10:05:00.000Z",
                updatedAt: "2026-04-27T10:06:00.000Z",
                status: "success",
                summary: "Completed run.",
                nodes: [],
                edges: [],
              },
              {
                id: "run-legacy-error",
                startedAt: "2026-04-27T10:07:00.000Z",
                updatedAt: "2026-04-27T10:08:00.000Z",
                status: "error",
                summary: "Stopped run.",
                nodes: [],
                edges: [],
              },
            ],
            selectedRunId: "run-canceled",
          },
        ],
        roles: [],
      }),
    ).toMatchObject({
      ok: true,
      settings: {
        blueprints: [
          {
            selectedRunId: "run-canceled",
            runHistory: [
              { status: "queued" },
              { status: "failed" },
              { status: "canceled" },
              { status: "succeeded" },
              { status: "failed" },
            ],
          },
        ],
      },
    });
  });

  it("normalizes older run detail fields in saved blueprints", () => {
    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [],
        modelPresets: [],
        blueprints: [
          {
            id: "blueprint-run",
            name: "Run Blueprint",
            updatedAt: "2026-04-27T09:00:00.000Z",
            lastRunStatus: "success",
            summary: "Saved run.",
            nodes: [
              {
                id: "agent-1",
                data: {
                  kind: "agent",
                  errorMessage: "The provider returned an empty completion.",
                  runDetails: {
                    kind: "agent",
                    modelId: "gpt-4o",
                  },
                },
              },
            ],
            edges: [],
            runHistory: [],
            selectedRunId: null,
          },
        ],
        roles: [],
      }),
    ).toMatchObject({
      ok: true,
      settings: {
        blueprints: [
          {
            nodes: [
              {
                data: {
                  errorMessage:
                    "The selected service returned an empty response.",
                  runDetails: {
                    modelName: "gpt-4o",
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects malformed run instance data", () => {
    expect(
      parseLocalSettingsSnapshot({
        modelConnections: [],
        modelPresets: [],
        blueprints: [
          {
            id: "blueprint-launch",
            name: "Launch Campaign",
            updatedAt: "2026-04-27T09:00:00.000Z",
            lastRunStatus: "success",
            summary: "Draft launch copy.",
            nodes: [],
            edges: [],
            runHistory: [
              {
                id: "run-broken",
                status: "not-run",
              },
            ],
            selectedRunId: "run-broken",
          },
        ],
        roles: [],
      }),
    ).toMatchObject({ ok: false });
  });

  it("fails without falling back when the home folder cannot hold settings", async () => {
    const homeFile = path.join(tmpdir(), `flowent-home-${randomUUID()}`);
    temporaryRoots.push(homeFile);
    await writeFile(homeFile, "not a directory", "utf8");

    await expect(
      saveLocalSettingsSnapshot(createSettingsSnapshot(), {
        homeDirectory: homeFile,
      }),
    ).rejects.toMatchObject({
      userMessage:
        "Settings could not be saved. Check that Flowent can write to your home folder.",
    });
  });
});
