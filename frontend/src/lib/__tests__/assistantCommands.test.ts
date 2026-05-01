import { describe, expect, it } from "vitest";
import {
  ASSISTANT_COMMANDS,
  insertAssistantCommand,
  isAssistantCommandReadyToSend,
  parseAssistantCommandInput,
  resolveAssistantCommandSelection,
  stepAssistantCommandSelection,
} from "@/lib/assistantCommands";

describe("assistantCommands", () => {
  it("parses non-command input as regular chat", () => {
    expect(parseAssistantCommandInput("ship this change")).toEqual({
      filtered: [],
      isCommandInput: false,
      token: "",
    });
  });

  it("parses slash input and filters matching commands", () => {
    expect(parseAssistantCommandInput("/")).toEqual({
      filtered: ASSISTANT_COMMANDS,
      isCommandInput: true,
      token: "/",
    });
    expect(parseAssistantCommandInput("/co")).toEqual({
      filtered: [ASSISTANT_COMMANDS[1]!],
      isCommandInput: true,
      token: "/co",
    });
  });

  it("resolves selection from the active token and clamps stale indices", () => {
    expect(
      resolveAssistantCommandSelection(
        [ASSISTANT_COMMANDS[0]!, ASSISTANT_COMMANDS[1]!],
        { index: 7, token: "/" },
        "/",
      ),
    ).toEqual({
      selectedCommand: ASSISTANT_COMMANDS[1]!,
      selectedCommandIndex: 1,
    });

    expect(
      resolveAssistantCommandSelection(
        [ASSISTANT_COMMANDS[2]!],
        { index: 1, token: "/c" },
        "/h",
      ),
    ).toEqual({
      selectedCommand: ASSISTANT_COMMANDS[2]!,
      selectedCommandIndex: 0,
    });
  });

  it("steps command selection with wraparound", () => {
    expect(
      stepAssistantCommandSelection(
        ASSISTANT_COMMANDS,
        { index: 2, token: "/" },
        "/",
        1,
      ),
    ).toEqual({
      index: 0,
      token: "/",
    });

    expect(
      stepAssistantCommandSelection(
        ASSISTANT_COMMANDS,
        { index: 0, token: "/" },
        "/",
        -1,
      ),
    ).toEqual({
      index: 2,
      token: "/",
    });
  });

  it("detects whether the selected command input is ready to send", () => {
    expect(isAssistantCommandReadyToSend("/compact rollout", "/compact")).toBe(
      true,
    );
    expect(isAssistantCommandReadyToSend("/compact", "/compact")).toBe(true);
    expect(isAssistantCommandReadyToSend("/co", "/compact")).toBe(false);
  });

  it("inserts completed commands with a space after the command token", () => {
    expect(insertAssistantCommand("/", ASSISTANT_COMMANDS[0]!)).toBe("/clear ");
    expect(insertAssistantCommand("  /he extra", ASSISTANT_COMMANDS[2]!)).toBe(
      "  /help extra",
    );
    expect(insertAssistantCommand("/", ASSISTANT_COMMANDS[1]!)).toBe(
      "/compact ",
    );
    expect(
      insertAssistantCommand(
        "  /co focus on regressions",
        ASSISTANT_COMMANDS[1]!,
      ),
    ).toBe("  /compact focus on regressions");
  });
});
