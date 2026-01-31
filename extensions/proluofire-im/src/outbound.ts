import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { sendMessageProluofireIm } from "./send.js";
import { uploadMedia } from "./media.js";

/**
 * Outbound message handler for proluofire-im
 */
export const proluofireImOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  chunkerMode: "text",
  textChunkLimit: 4000,

  sendText: async ({ cfg, to, text }) => {
    await sendMessageProluofireIm(to, text);
    return {
      channel: "proluofire-im" as const,
      messageId: `${Date.now()}`,
      to
    };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl }) => {
    // TODO: Implement media sending with proluofire-im
    await sendMessageProluofireIm(to, text);
    return {
      channel: "proluofire-im" as const,
      messageId: `${Date.now()}`,
      to
    };
  },
};
