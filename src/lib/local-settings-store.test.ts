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
      providers: settings.providers,
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
        providers: settings.providers,
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

  it("rejects settings with invalid provider or preset sections", () => {
    expect(
      parseLocalSettingsSnapshot({
        providers: [{ id: "provider-openai" }],
        modelPresets: [],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseLocalSettingsSnapshot({
        providers: [],
        modelPresets: [{ id: "preset-writing" }],
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
