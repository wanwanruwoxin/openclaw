import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { sendMessageProluofireIm } from "./send.js";
import { getProluofireImRuntime } from "./runtime.js";

/**
 * Outbound message handler for proluofire-im
 */
export const proluofireImOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getProluofireImRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,

  sendText: async ({ cfg, to, text, accountId, replyToId, threadId }) => {
    const normalizedThreadId =
      threadId === null || threadId === undefined ? undefined : String(threadId);
    const result = await sendMessageProluofireIm(to, text, {
      cfg: cfg as CoreConfig,
      accountId: accountId ?? undefined,
      replyToId: replyToId ?? undefined,
      threadId: normalizedThreadId,
    });
    return {
      channel: "proluofire-im" as const,
      messageId: result.messageId,
      to,
    };
  },

  sendMedia: async () => {
    throw new Error("Proluofire IM media sends are not supported yet");
  },
};
