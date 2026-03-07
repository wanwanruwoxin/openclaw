import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import path from "node:path";
import type { CoreConfig } from "./types.js";
import { getProluofireImRuntime } from "./runtime.js";
import { sendMessageProluofireIm, sendMessageWithMedia } from "./send.js";
import { PROLUOFIRE_IM_CONTENT_TYPE } from "./types.js";

const MEDIA_FILE_SUFFIX_RE =
  /\.(?:jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|mp4|mov|avi|mkv|webm|mp3|wav|ogg|m4a|aac|flac|pdf|docx?|pptx?|xlsx?|zip|rar|7z)(?:$|[?#])/i;

function normalizeInlineMediaTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    if (end > 1) return trimmed.slice(1, end).trim();
  }
  const first = trimmed.split(/\s+/)[0] ?? "";
  return first.replace(/^<|>$/g, "").trim();
}

function isLikelyLocalMediaSource(source: string): boolean {
  if (!source) return false;
  if (source.startsWith("file://")) return true;
  if (source.startsWith("~/")) return true;
  if (source.startsWith("./") || source.startsWith(".\\")) return true;
  if (path.isAbsolute(source) || /^[a-zA-Z]:[\\/]/.test(source)) return true;
  return false;
}

function isLikelyMediaSource(source: string, options?: { fromImageSyntax?: boolean }): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (isLikelyLocalMediaSource(trimmed)) return true;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (options?.fromImageSyntax) return true;
  return MEDIA_FILE_SUFFIX_RE.test(trimmed);
}

function extractInlineMediaFromText(rawText: string): { text: string; mediaUrls: string[] } {
  const mediaUrls: string[] = [];
  const seen = new Set<string>();
  const pushMedia = (candidate: string, options?: { fromImageSyntax?: boolean }): boolean => {
    const normalized = candidate.trim();
    if (!isLikelyMediaSource(normalized, options)) return false;
    if (seen.has(normalized)) return true;
    seen.add(normalized);
    mediaUrls.push(normalized);
    return true;
  };

  let text = rawText ?? "";
  text = text.replace(/!\[[^\]]*]\(([^)\n]+)\)/g, (match, target) => {
    const source = normalizeInlineMediaTarget(String(target));
    return pushMedia(source, { fromImageSyntax: true }) ? "" : match;
  });

  text = text.replace(
    /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi,
    (match, quotedDouble, quotedSingle, bare) => {
      const source = String(quotedDouble ?? quotedSingle ?? bare ?? "").trim();
      return pushMedia(source, { fromImageSyntax: true }) ? "" : match;
    },
  );

  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    const urlOnly = trimmed.match(/^(?:[-*+]\s+)?(https?:\/\/\S+)$/i);
    if (!urlOnly) return line;
    const candidate = String(urlOnly[1]).replace(/[),.;!?]+$/, "");
    return pushMedia(candidate) ? "" : line;
  });

  const cleaned = lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return { text: cleaned, mediaUrls };
}

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
    const extracted = extractInlineMediaFromText(text ?? "");
    const options = {
      cfg: cfg as CoreConfig,
      accountId: accountId ?? undefined,
      replyToId: replyToId ?? undefined,
      threadId: normalizedThreadId,
    };
    const result =
      extracted.mediaUrls.length > 0
        ? await sendMessageWithMedia(
            to,
            extracted.text,
            extracted.mediaUrls.map((mediaPath) => ({ path: mediaPath, type: "" })),
            options,
          )
        : await sendMessageProluofireIm(to, text, options);
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
