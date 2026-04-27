import { NextResponse } from "next/server";

import {
  LocalSettingsStoreError,
  readLocalSettingsSnapshot,
  saveLocalSettingsSnapshot,
} from "@/lib/local-settings-store";

export const runtime = "nodejs";

const invalidSettingsMessage =
  "Settings could not be saved because the data format is not valid.";

function errorMessageFrom(error: unknown, fallback: string) {
  if (error instanceof LocalSettingsStoreError) {
    return error.userMessage;
  }

  return fallback;
}

async function readRequestBody(request: Request) {
  try {
    return { ok: true as const, value: await request.json() };
  } catch {
    return { ok: false as const };
  }
}

function unwrapSettingsSnapshot(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "settings" in value
  ) {
    return value.settings;
  }

  return value;
}

async function saveSettings(request: Request) {
  const bodyResult = await readRequestBody(request);

  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: invalidSettingsMessage },
      { status: 400 },
    );
  }

  try {
    const settings = await saveLocalSettingsSnapshot(
      unwrapSettingsSnapshot(bodyResult.value),
    );

    return NextResponse.json({ saved: true, settings });
  } catch (error) {
    const status =
      error instanceof LocalSettingsStoreError &&
      error.kind === "invalid-settings"
        ? 400
        : 500;
    const message = errorMessageFrom(error, invalidSettingsMessage);

    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    const result = await readLocalSettingsSnapshot();

    if (result.status === "missing") {
      return NextResponse.json({ saved: false, settings: null });
    }

    return NextResponse.json({ saved: true, settings: result.settings });
  } catch (error) {
    return NextResponse.json(
      {
        error: errorMessageFrom(error, "Saved settings could not be loaded."),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  return saveSettings(request);
}

export async function POST(request: Request) {
  return saveSettings(request);
}
