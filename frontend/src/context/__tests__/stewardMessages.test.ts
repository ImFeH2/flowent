import { describe, expect, it } from "vitest";
import {
  appendStewardMessage,
  appendStewardStreamChunk,
  finalizeStewardStream,
} from "@/context/stewardMessages";
import type { StewardMessage } from "@/types";

function buildMessage(
  overrides: Partial<StewardMessage> & Pick<StewardMessage, "id">,
): StewardMessage {
  return {
    content: "",
    timestamp: 0,
    from: "steward",
    ...overrides,
  };
}

describe("stewardMessages", () => {
  it("keeps appending stream chunks to the active steward bubble after a human message is inserted", () => {
    const messages = [
      buildMessage({
        id: "steward-1",
        from: "steward",
        content: "你好！我在这儿。你想让我帮你做",
        timestamp: 100,
      }),
      buildMessage({
        id: "human-1",
        from: "human",
        content: "看看目录下有什么",
        timestamp: 200,
      }),
    ];

    const result = appendStewardStreamChunk(
      messages,
      "steward-1",
      "什么：查资料",
      () =>
        buildMessage({
          id: "steward-2",
          from: "steward",
          content: "什么：查资料",
          timestamp: 300,
        }),
    );

    expect(result.activeStreamMessageId).toBe("steward-1");
    expect(result.messages).toEqual([
      buildMessage({
        id: "steward-1",
        from: "steward",
        content: "你好！我在这儿。你想让我帮你做什么：查资料",
        timestamp: 100,
      }),
      buildMessage({
        id: "human-1",
        from: "human",
        content: "看看目录下有什么",
        timestamp: 200,
      }),
    ]);
  });

  it("finalizes the active steward bubble instead of appending a duplicate full message", () => {
    const messages = [
      buildMessage({
        id: "steward-1",
        from: "steward",
        content: "你好！我在这儿。你想让我帮你做什么：查资料",
        timestamp: 100,
      }),
      buildMessage({
        id: "human-1",
        from: "human",
        content: "看看目录下有什么",
        timestamp: 200,
      }),
    ];

    const result = finalizeStewardStream(
      messages,
      "steward-1",
      buildMessage({
        id: "steward-final",
        from: "steward",
        content:
          "你好！我在这儿。你想让我帮你做什么：查资料、写文案/邮件、改简历、做计划、排查代码问题，还是别的？",
        timestamp: 400,
      }),
    );

    expect(result.activeStreamMessageId).toBeNull();
    expect(result.messages).toEqual([
      buildMessage({
        id: "steward-1",
        from: "steward",
        content:
          "你好！我在这儿。你想让我帮你做什么：查资料、写文案/邮件、改简历、做计划、排查代码问题，还是别的？",
        timestamp: 400,
      }),
      buildMessage({
        id: "human-1",
        from: "human",
        content: "看看目录下有什么",
        timestamp: 200,
      }),
    ]);
  });

  it("still deduplicates repeated non-stream messages", () => {
    const message = buildMessage({
      id: "steward-1",
      from: "steward",
      content: "当前目录下有这些内容：",
      timestamp: 500,
    });

    expect(
      appendStewardMessage([message], { ...message, id: "steward-2" }),
    ).toEqual([message]);
  });
});
