import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { getProluofireImRuntime } from "./runtime.js";
import { sendMessageProluofireIm, sendMessageWithMedia } from "./send.js";
import { PROLUOFIRE_IM_CONTENT_TYPE } from "./types.js";

function inferContentTypeFromMediaUrl(mediaUrl: string): number {
  const normalized = mediaUrl.trim().toLowerCase();
  const withoutQuery = normalized.split("?")[0].split("#")[0];
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(withoutQuery)) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Image;
  }
  if (/\.(mp3|wav|ogg|aac|m4a|flac)$/.test(withoutQuery)) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Voice;
  }
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(withoutQuery)) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Video;
  }
  return PROLUOFIRE_IM_CONTENT_TYPE.File;
}

function resolveRemoteMediaPayload(mediaUrl: string, contentType: number): string {
  const lastSegment = mediaUrl.split("?")[0].split("#")[0].split("/").filter(Boolean).at(-1);
  const payload: Record<string, string | number> = {
    file_url: mediaUrl,
  };
  if (lastSegment) {
    payload.file_name = decodeURIComponent(lastSegment);
  }
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Image) {
    payload.thumbnail_url = mediaUrl;
  }
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Video) {
    payload.thumbnail_url = mediaUrl;
  }
  return JSON.stringify(payload);
}

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

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId, threadId }) => {
    const normalizedThreadId =
      threadId === null || threadId === undefined ? undefined : String(threadId);
    const normalizedMediaUrl = mediaUrl?.trim();

    if (!normalizedMediaUrl) {
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
    }

    try {
      const result = await sendMessageWithMedia(
        to,
        text ?? "",
        [{ path: normalizedMediaUrl, type: "" }],
        {
          cfg: cfg as CoreConfig,
          accountId: accountId ?? undefined,
          replyToId: replyToId ?? undefined,
          threadId: normalizedThreadId,
        },
      );
      return {
        channel: "proluofire-im" as const,
        messageId: result.messageId,
        to,
      };
    } catch (err) {
      console.error(`[proluofire-im] media send failed, fallback to link:`, err);
      try {
        const contentType = inferContentTypeFromMediaUrl(normalizedMediaUrl);
        const payload = resolveRemoteMediaPayload(normalizedMediaUrl, contentType);
        const directMedia = await sendMessageProluofireIm(to, payload, {
          cfg: cfg as CoreConfig,
          accountId: accountId ?? undefined,
          replyToId: replyToId ?? undefined,
          threadId: normalizedThreadId,
          contentType,
        });
        return {
          channel: "proluofire-im" as const,
          messageId: directMedia.messageId,
          to,
        };
      } catch (directErr) {
        console.error(`[proluofire-im] direct media fallback failed:`, directErr);
      }
      const fallbackText = [text?.trim(), `Attachment: ${normalizedMediaUrl}`]
        .filter(Boolean)
        .join("\n");
      const result = await sendMessageProluofireIm(to, fallbackText, {
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
    }
  },
};
