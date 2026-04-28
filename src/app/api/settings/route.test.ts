import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryRoots: string[] = [];
const originalTestHomeDirectory = process.env.FLOWENT_TEST_HOME_DIRECTORY;

async function createHomeDirectory() {
  const homeDirectory = path.join(
    tmpdir(),
    `flowent-route-settings-${randomUUID()}`,
  );
  await mkdir(homeDirectory, { recursive: true });
  temporaryRoots.push(homeDirectory);
  return homeDirectory;
}

async function importSettingsRoute(homeDirectory: string) {
  vi.resetModules();
  process.env.FLOWENT_TEST_HOME_DIRECTORY = homeDirectory;

  return import("./route");
}

function createSettingsSnapshot() {
  return {
    modelConnections: [
      {
        id: "connection-local-service",
        type: "openai-responses",
        name: "Local model service",
        accessKey: "saved-key",
        endpointUrl: "http://localhost:4000/v1",
      },
    ],
    modelPresets: [
      {
        id: "preset-review",
        name: "Review Model",
        modelConnectionId: "connection-local-service",
        modelName: "gpt-4.1",
        temperature: 0.2,
        outputLimit: 1800,
      },
    ],
    blueprints: [],
    roles: [],
  };
}

function settingsRequest(body: unknown) {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  vi.resetModules();
  if (originalTestHomeDirectory === undefined) {
    delete process.env.FLOWENT_TEST_HOME_DIRECTORY;
  } else {
    process.env.FLOWENT_TEST_HOME_DIRECTORY = originalTestHomeDirectory;
  }
  await Promise.all(
    temporaryRoots.map((temporaryRoot) =>
      rm(temporaryRoot, { force: true, recursive: true }),
    ),
  );
  temporaryRoots.length = 0;
});

describe("settings route", () => {
  it("returns an empty result when settings have not been saved", async () => {
    const route = await importSettingsRoute(await createHomeDirectory());

    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saved: false,
      settings: null,
    });
  });

  it("saves and reads a local settings snapshot", async () => {
    const route = await importSettingsRoute(await createHomeDirectory());
    const settings = createSettingsSnapshot();

    const saveResponse = await route.PUT(settingsRequest({ settings }));
    const readResponse = await route.GET();

    expect(saveResponse.status).toBe(200);
    await expect(saveResponse.json()).resolves.toMatchObject({
      saved: true,
      settings: {
        version: 1,
        modelConnections: settings.modelConnections,
        modelPresets: settings.modelPresets,
        blueprints: settings.blueprints,
        roles: settings.roles,
      },
    });
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({
      saved: true,
      settings: {
        modelConnections: settings.modelConnections,
        modelPresets: settings.modelPresets,
      },
    });
  });

  it("rejects malformed request data", async () => {
    const route = await importSettingsRoute(await createHomeDirectory());
    const response = await route.PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Settings could not be saved because the data format is not valid.",
    });
  });

  it("rejects settings with the wrong structure", async () => {
    const route = await importSettingsRoute(await createHomeDirectory());
    const response = await route.PUT(
      settingsRequest({
        modelConnections: "connection-work-gateway",
        modelPresets: [],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Settings could not be saved because the data format is not valid.",
    });
  });

  it("returns a saving failure when the home folder cannot be prepared", async () => {
    const homeFile = path.join(tmpdir(), `flowent-route-home-${randomUUID()}`);
    temporaryRoots.push(homeFile);
    await writeFile(homeFile, "not a directory", "utf8");
    const route = await importSettingsRoute(homeFile);

    const response = await route.PUT(settingsRequest(createSettingsSnapshot()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Settings could not be saved. Check that Flowent can write to your home folder.",
    });
  });
});
