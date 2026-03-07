import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessageProluofireIm: vi.fn(),
  sendMessageWithMedia: vi.fn(),
  getProluofireImRuntime: vi.fn(() => ({
    channel: {
      text: {
        chunkMarkdownText: (text: string) => [text],
      },
    },
  })),
}));

vi.mock("./send.js", () => ({
  sendMessageProluofireIm: mocks.sendMessageProluofireIm,
  sendMessageWithMedia: mocks.sendMessageWithMedia,
}));

vi.mock("./runtime.js", () => ({
  getProluofireImRuntime: mocks.getProluofireImRuntime,
}));

import { proluofireImOutbound } from "./outbound.js";

describe("proluofireImOutbound.sendText", () => {
  beforeEach(() => {
    mocks.sendMessageProluofireIm.mockReset();
    mocks.sendMessageWithMedia.mockReset();
  });

  it("extracts markdown image links and sends media payloads", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    mocks.sendMessageWithMedia.mockResolvedValue({
      messageId: "m-inline-media",
      to: "#42",
    });

    const result = await proluofireImOutbound.sendText?.({
      cfg,
      to: "#42",
      text: "图在这里\n![preview](https://example.com/image.png)\n请查看",
      accountId: "work",
      replyToId: "100",
      threadId: "thread-inline",
    });

    expect(mocks.sendMessageWithMedia).toHaveBeenCalledWith(
      "#42",
      "图在这里\n请查看",
      [{ path: "https://example.com/image.png", type: "" }],
      {
        cfg,
        accountId: "work",
        replyToId: "100",
        threadId: "thread-inline",
      },
    );
    expect(mocks.sendMessageProluofireIm).not.toHaveBeenCalled();
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-inline-media",
      to: "#42",
    });
  });

  it("keeps regular markdown links as text", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    mocks.sendMessageProluofireIm.mockResolvedValue({
      messageId: "m-text",
      to: "#42",
    });

    const result = await proluofireImOutbound.sendText?.({
      cfg,
      to: "#42",
      text: "参考文档: [README](https://example.com/readme)",
      accountId: "work",
      replyToId: null,
      threadId: null,
    });

    expect(mocks.sendMessageProluofireIm).toHaveBeenCalledWith(
      "#42",
      "参考文档: [README](https://example.com/readme)",
      {
        cfg,
        accountId: "work",
        replyToId: undefined,
        threadId: undefined,
      },
    );
    expect(mocks.sendMessageWithMedia).not.toHaveBeenCalled();
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-text",
      to: "#42",
    });
  });
});

describe("proluofireImOutbound.sendMedia", () => {
  beforeEach(() => {
    mocks.sendMessageProluofireIm.mockReset();
    mocks.sendMessageWithMedia.mockReset();
  });

  it("uploads media and sends attachment when mediaUrl is provided", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    mocks.sendMessageWithMedia.mockResolvedValue({
      messageId: "m-media",
      to: "#42",
    });

    const result = await proluofireImOutbound.sendMedia?.({
      cfg,
      to: "#42",
      text: "image caption",
      mediaUrl: "https://example.com/image.jpg",
      accountId: "work",
      replyToId: "99",
      threadId: "thread-1",
    });

    expect(mocks.sendMessageWithMedia).toHaveBeenCalledWith(
      "#42",
      "image caption",
      [{ path: "https://example.com/image.jpg", type: "" }],
      {
        cfg,
        accountId: "work",
        replyToId: "99",
        threadId: "thread-1",
      },
    );
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-media",
      to: "#42",
    });
  });

  it("falls back to direct media payload when upload/send fails", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendMessageWithMedia.mockRejectedValue(new Error("upload failed"));
    mocks.sendMessageProluofireIm.mockResolvedValue({
      messageId: "m-direct",
      to: "#42",
    });

    const result = await proluofireImOutbound.sendMedia?.({
      cfg,
      to: "#42",
      text: "report",
      mediaUrl: "https://example.com/report.pdf",
      accountId: "work",
      replyToId: "101",
      threadId: "thread-2",
    });

    expect(mocks.sendMessageProluofireIm).toHaveBeenCalledWith(
      "#42",
      JSON.stringify({
        file_url: "https://example.com/report.pdf",
        file_name: "report.pdf",
      }),
      {
        cfg,
        accountId: "work",
        replyToId: "101",
        threadId: "thread-2",
        contentType: 5,
      },
    );
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-direct",
      to: "#42",
    });
    consoleErrorSpy.mockRestore();
  });

  it("falls back to text when direct media fallback also fails", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendMessageWithMedia.mockRejectedValue(new Error("upload failed"));
    mocks.sendMessageProluofireIm
      .mockRejectedValueOnce(new Error("direct media failed"))
      .mockResolvedValueOnce({
        messageId: "m-text-fallback",
        to: "#42",
      });

    const result = await proluofireImOutbound.sendMedia?.({
      cfg,
      to: "#42",
      text: "report",
      mediaUrl: "https://example.com/report.pdf",
      accountId: "work",
      replyToId: "101",
      threadId: "thread-2",
    });

    expect(mocks.sendMessageProluofireIm).toHaveBeenLastCalledWith(
      "#42",
      "report\nAttachment: https://example.com/report.pdf",
      {
        cfg,
        accountId: "work",
        replyToId: "101",
        threadId: "thread-2",
      },
    );
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-text-fallback",
      to: "#42",
    });
    consoleErrorSpy.mockRestore();
  });

  it("sends text directly when mediaUrl is missing", async () => {
    const cfg = { channels: {} } as OpenClawConfig;
    mocks.sendMessageProluofireIm.mockResolvedValue({
      messageId: "m-text",
      to: "#42",
    });

    const result = await proluofireImOutbound.sendMedia?.({
      cfg,
      to: "#42",
      text: "text only",
      mediaUrl: "",
      accountId: "work",
      replyToId: null,
      threadId: null,
    });

    expect(mocks.sendMessageProluofireIm).toHaveBeenCalledWith("#42", "text only", {
      cfg,
      accountId: "work",
      replyToId: undefined,
      threadId: undefined,
    });
    expect(result).toEqual({
      channel: "proluofire-im",
      messageId: "m-text",
      to: "#42",
    });
  });
});
