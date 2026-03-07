import { Buffer } from "node:buffer";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type {
  CoreConfig,
  ProluofireImAttachment,
  ProluofireImClient,
  ProluofireImContentType,
  SendMessageOptions,
} from "./types.js";
import { createProluofireImClient, resolveProluofireImAuth } from "./client.js";
import { uploadMedia } from "./media.js";
import {
  convertMarkdownToProluofireIm,
  convertMentionsToProluofireIm,
  encodeMessage,
  normalizeTarget,
} from "./protocol.js";
import {
  getClientForAccount,
  getProluofireImRuntime,
  markOutboundMessage,
  resolveDirectRoomForTarget,
} from "./runtime.js";
import { PROLUOFIRE_IM_CONTENT_TYPE } from "./types.js";

// Rate limiting state
const rateLimitState = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 20; // Max messages per window

export type ProluofireImSendOptions = SendMessageOptions & {
  cfg?: CoreConfig;
  accountId?: string;
  client?: ProluofireImClient;
};

type ProluofireImSendResult = {
  messageId: string;
  to: string;
};

function resolveOutboundTarget(params: { target: string; accountId: string }): {
  normalizedTarget: string;
  resolvedTarget: string;
  mappedDirectRoom: string | null;
} {
  const normalizedTarget = normalizeTarget(params.target);
  if (!normalizedTarget) {
    throw new Error("Target cannot be empty");
  }
  const mappedDirectRoom =
    resolveDirectRoomForTarget({
      accountId: params.accountId,
      target: params.target,
    }) ??
    (normalizedTarget.startsWith("@")
      ? resolveDirectRoomForTarget({
          accountId: params.accountId,
          target: normalizedTarget,
        })
      : null);
  const resolvedTarget = mappedDirectRoom ? `#${mappedDirectRoom}` : normalizedTarget;
  return { normalizedTarget, resolvedTarget, mappedDirectRoom };
}

function resolveRoomIdHintForTarget(params: {
  target: string;
  accountId: string;
}): string | undefined {
  const { resolvedTarget } = resolveOutboundTarget(params);
  const roomCandidate = resolvedTarget.replace(/^#/, "").trim();
  return /^\d+$/.test(roomCandidate) ? roomCandidate : undefined;
}

async function resolveClientForSend(params: {
  cfg: CoreConfig;
  accountId: string;
  client?: ProluofireImClient;
}): Promise<{ client: ProluofireImClient; release: () => Promise<void> }> {
  if (params.client) {
    return { client: params.client, release: async () => {} };
  }
  const existing = getClientForAccount(params.accountId);
  if (existing) {
    return { client: existing, release: async () => {} };
  }
  const auth = await resolveProluofireImAuth({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const client = await createProluofireImClient(auth);
  await client.connect();
  return {
    client,
    release: async () => {
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors for ephemeral clients.
      }
    },
  };
}

/**
 * Send a message via proluofire-im.
 */
export async function sendMessageProluofireIm(
  target: string,
  content: string,
  options?: ProluofireImSendOptions,
): Promise<ProluofireImSendResult> {
  try {
    const runtime = getProluofireImRuntime();
    const cfg = options?.cfg ?? (runtime.config.loadConfig() as CoreConfig);
    const accountId = options?.accountId ?? DEFAULT_ACCOUNT_ID;

    const { resolvedTarget, mappedDirectRoom } = resolveOutboundTarget({
      target,
      accountId,
    });
    if (mappedDirectRoom) {
      console.log(`[proluofire-im] resolved direct target ${target} -> room ${mappedDirectRoom}`);
    }

    // Check rate limit
    await checkRateLimit(resolvedTarget);

    // Encode and format message
    const tableMode = runtime.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "proluofire-im",
      accountId,
    });
    const normalizedContent = runtime.channel.text.convertMarkdownTables(content ?? "", tableMode);
    const encodedContent = encodeMessage(normalizedContent);
    const formattedContent = convertMarkdownToProluofireIm(encodedContent);
    const finalTextContent = convertMentionsToProluofireIm(formattedContent);
    const contentType = options?.contentType ?? PROLUOFIRE_IM_CONTENT_TYPE.Text;
    const finalContent =
      contentType === PROLUOFIRE_IM_CONTENT_TYPE.Text ? finalTextContent : (content ?? "");

    const { client, release } = await resolveClientForSend({
      cfg,
      accountId,
      client: options?.client,
    });
    let messageId = "";
    try {
      messageId = await client.sendMessage(resolvedTarget, finalContent, options);
    } finally {
      await release();
    }

    // Update rate limit
    updateRateLimit(resolvedTarget);

    // Mark outbound message (for status tracking)
    markOutboundMessage(accountId);

    return {
      messageId: messageId || `${Date.now()}`,
      to: resolvedTarget,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send message to ${target}: ${errorMsg}`);
  }
}

/**
 * Send a direct message to a user
 *
 * TODO: Implement user-specific message sending if proluofire-im has different APIs for DMs
 */
export async function sendDirectMessage(
  userId: string,
  content: string,
  options?: ProluofireImSendOptions,
): Promise<void> {
  try {
    // Ensure target is formatted as user identifier
    const userTarget = userId.startsWith("@") ? userId : `@${userId}`;

    await sendMessageProluofireIm(userTarget, content, options);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send DM to ${userId}: ${errorMsg}`);
  }
}

/**
 * Send a message to a group/channel
 *
 * TODO: Implement group-specific message sending if proluofire-im has different APIs for groups
 */
export async function sendGroupMessage(
  groupId: string,
  content: string,
  options?: ProluofireImSendOptions,
): Promise<void> {
  try {
    // Ensure target is formatted as group identifier
    const groupTarget = groupId.startsWith("#") ? groupId : `#${groupId}`;

    await sendMessageProluofireIm(groupTarget, content, options);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send message to group ${groupId}: ${errorMsg}`);
  }
}

/**
 * Check rate limit for a target
 */
async function checkRateLimit(target: string): Promise<void> {
  const now = Date.now();
  const state = rateLimitState.get(target);

  if (!state) {
    // First message to this target
    rateLimitState.set(target, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  // Check if window has expired
  if (now >= state.resetAt) {
    // Reset window
    state.count = 0;
    state.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return;
  }

  // Check if limit exceeded
  if (state.count >= RATE_LIMIT_MAX_MESSAGES) {
    const waitMs = state.resetAt - now;
    throw new Error(`Rate limit exceeded for ${target}. Try again in ${Math.ceil(waitMs / 1000)}s`);
  }
}

/**
 * Update rate limit counter
 */
function updateRateLimit(target: string): void {
  const state = rateLimitState.get(target);
  if (state) {
    state.count++;
  }
}

function resolveMediaMaxSizeMb(cfg: CoreConfig, accountId: string): number {
  const channelCfg = cfg.channels?.["proluofire-im"];
  const accountCfg = channelCfg?.accounts?.[accountId];
  const raw =
    typeof accountCfg?.mediaMaxMb === "number"
      ? accountCfg.mediaMaxMb
      : typeof channelCfg?.mediaMaxMb === "number"
        ? channelCfg.mediaMaxMb
        : 50;
  if (!Number.isFinite(raw)) {
    return 50;
  }
  return Math.max(1, raw);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function resolveExtensionFromPathOrUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname || "";
    const index = pathname.lastIndexOf(".");
    if (index < 0) return "";
    return pathname.slice(index).toLowerCase();
  } catch {
    const normalized = trimmed.replace(/[?#].*$/, "");
    const index = normalized.lastIndexOf(".");
    if (index < 0) return "";
    return normalized.slice(index).toLowerCase();
  }
}

function resolveMediaContentTypeFromSource(source: string): ProluofireImContentType | null {
  const ext = resolveExtensionFromPathOrUrl(source);
  if (!ext) return null;
  const mimeType = MIME_BY_EXTENSION[ext] || "";
  if (mimeType.startsWith("image/")) return PROLUOFIRE_IM_CONTENT_TYPE.Image;
  if (mimeType.startsWith("audio/")) return PROLUOFIRE_IM_CONTENT_TYPE.Voice;
  if (mimeType.startsWith("video/")) return PROLUOFIRE_IM_CONTENT_TYPE.Video;
  return null;
}

function resolveMediaContentType(attachment: ProluofireImAttachment): ProluofireImContentType {
  const mediaType = (attachment.mimeType || attachment.type || "").toLowerCase();
  if (mediaType.startsWith("image/")) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Image;
  }
  if (mediaType.startsWith("audio/")) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Voice;
  }
  if (mediaType.startsWith("video/")) {
    return PROLUOFIRE_IM_CONTENT_TYPE.Video;
  }
  const byFileName = attachment.filename
    ? resolveMediaContentTypeFromSource(attachment.filename)
    : null;
  if (byFileName) {
    return byFileName;
  }
  const byUrl = attachment.url ? resolveMediaContentTypeFromSource(attachment.url) : null;
  if (byUrl) {
    return byUrl;
  }
  return PROLUOFIRE_IM_CONTENT_TYPE.File;
}

function resolveMediaContentPayload(params: {
  attachment: ProluofireImAttachment;
  contentType: ProluofireImContentType;
}): string {
  const { attachment, contentType } = params;
  const fileUrl = attachment.url?.trim();
  if (!fileUrl) {
    throw new Error("Uploaded media is missing file_url");
  }

  const payload: Record<string, string | number> = { file_url: fileUrl };
  const fileName = attachment.filename?.trim();
  if (fileName) {
    payload.file_name = fileName;
  }

  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Image) {
    payload.thumbnail_url = attachment.thumbnailUrl?.trim() || fileUrl;
    const width = normalizePositiveInteger(attachment.width);
    const height = normalizePositiveInteger(attachment.height);
    if (width) payload.width = width;
    if (height) payload.height = height;
  } else if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Video) {
    payload.thumbnail_url = attachment.thumbnailUrl?.trim() || fileUrl;
    const width = normalizePositiveInteger(attachment.width);
    const height = normalizePositiveInteger(attachment.height);
    const duration = normalizePositiveInteger(attachment.duration);
    if (width) payload.width = width;
    if (height) payload.height = height;
    if (duration) payload.duration = duration;
  } else if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Voice) {
    const duration = normalizePositiveInteger(attachment.duration);
    if (duration) payload.duration = duration;
  } else if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.File) {
    const fileSize =
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? Math.max(0, Math.trunc(attachment.size))
        : 0;
    if (fileSize > 0) {
      payload.file_size = fileSize;
    }
  }

  return JSON.stringify(payload);
}

/**
 * Send message with retry logic
 *
 * TODO: Customize retry logic based on proluofire-im's error responses
 * - Some errors should retry (network, temporary server issues)
 * - Some errors should not retry (invalid target, permission denied)
 */
export async function sendMessageWithRetry(
  target: string,
  content: string,
  options?: ProluofireImSendOptions,
  maxRetries = 3,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageProluofireIm(target, content, options);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      // Wait before retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(
          `[proluofire-im] Retry attempt ${attempt + 1}/${maxRetries} in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("Failed to send message after retries");
}

/**
 * Determine if an error is retryable
 *
 * TODO: Customize based on proluofire-im's error codes/types
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors - retryable
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused")
  ) {
    return true;
  }

  // Server errors (5xx) - retryable
  if (message.includes("server error") || message.includes("503") || message.includes("502")) {
    return true;
  }

  // Rate limit - not retryable (caller should wait)
  if (message.includes("rate limit")) {
    return false;
  }

  // Client errors (4xx) - not retryable
  if (
    message.includes("not found") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid")
  ) {
    return false;
  }

  // Default: retry
  return true;
}

export async function sendMessageWithMedia(
  target: string,
  content: string,
  attachments: Array<{ path: string; type: string }>,
  options?: ProluofireImSendOptions,
): Promise<ProluofireImSendResult> {
  if (!attachments.length) {
    return sendMessageProluofireIm(target, content, options);
  }

  const runtime = getProluofireImRuntime();
  const cfg = options?.cfg ?? (runtime.config.loadConfig() as CoreConfig);
  const accountId = options?.accountId ?? DEFAULT_ACCOUNT_ID;
  const maxSizeMb = resolveMediaMaxSizeMb(cfg, accountId);
  const roomIdHint = resolveRoomIdHintForTarget({
    target,
    accountId,
  });

  const uploaded: ProluofireImAttachment[] = [];
  for (const attachment of attachments) {
    const mediaPath = attachment.path?.trim();
    if (!mediaPath) {
      continue;
    }
    uploaded.push(
      await uploadMedia({
        cfg,
        accountId,
        filePath: mediaPath,
        mimeType: attachment.type?.trim() || undefined,
        maxSizeMb,
        roomIdHint,
      }),
    );
  }

  if (!uploaded.length) {
    throw new Error("No media attachments were uploaded");
  }

  const caption = content.trim();
  let replyToId = options?.replyToId;

  if (caption) {
    await sendMessageProluofireIm(target, caption, {
      ...options,
      cfg,
      accountId,
    });
    replyToId = undefined;
  }

  let lastResult: ProluofireImSendResult | null = null;
  for (const uploadedAttachment of uploaded) {
    const contentType = resolveMediaContentType(uploadedAttachment);
    const mediaPayload = resolveMediaContentPayload({
      attachment: uploadedAttachment,
      contentType,
    });
    lastResult = await sendMessageProluofireIm(target, mediaPayload, {
      ...options,
      cfg,
      accountId,
      replyToId,
      contentType,
    });
    replyToId = undefined;
  }

  if (!lastResult) {
    throw new Error("No media message was sent");
  }

  return lastResult;
}
