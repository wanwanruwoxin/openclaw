import { Buffer } from "node:buffer";
import WebSocket from "ws";
import type { CoreConfig } from "./types.js";
import type {
  ProluofireImClient,
  ProluofireImClientInternal,
  ConnectionStatus,
  ProluofireImAttachment,
  ProluofireImContentType,
  ProluofireImMessage,
} from "./types.js";
import { resolveProluofireImAccount } from "./accounts.js";
import { PROLUOFIRE_IM_CONTENT_TYPE } from "./types.js";

const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 15000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return Buffer.from(String(data)).toString("utf8");
}

function stringifyLargeIntegers(raw: string): string {
  return raw.replace(
    /"(roomId|id|uid|refId|userId|seq|replyMessageId)"\s*:\s*(\d{16,})/g,
    (_match, key, value) => `"${String(key)}":"${String(value)}"`,
  );
}

function normalizeId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") return value.trim();
  return "";
}

function normalizeRoomId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/^(proluofire-im:)?(group:|user:)?/i, "");
  const withoutPrefix = normalized.replace(/^[@#]/, "").trim();
  return withoutPrefix;
}

function resolveRoomIdFromTarget(target: string): string {
  const normalized = normalizeRoomId(target);
  if (!normalized) throw new Error("Target must be a room id");
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Target must be a numeric room id");
  }
  return normalized;
}

function buildLocalId(): string {
  const base = Date.now().toString();
  const suffix = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${base}${suffix}`;
}

function parseReplyMessageId(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readInteger(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
  }
  return undefined;
}

function parseContentType(value: unknown): ProluofireImContentType | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    if (
      normalized === PROLUOFIRE_IM_CONTENT_TYPE.Text ||
      normalized === PROLUOFIRE_IM_CONTENT_TYPE.Image ||
      normalized === PROLUOFIRE_IM_CONTENT_TYPE.Voice ||
      normalized === PROLUOFIRE_IM_CONTENT_TYPE.Video ||
      normalized === PROLUOFIRE_IM_CONTENT_TYPE.File
    ) {
      return normalized as ProluofireImContentType;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "1" || normalized === "text") return PROLUOFIRE_IM_CONTENT_TYPE.Text;
  if (normalized === "2" || normalized === "image") return PROLUOFIRE_IM_CONTENT_TYPE.Image;
  if (normalized === "3" || normalized === "voice" || normalized === "audio") {
    return PROLUOFIRE_IM_CONTENT_TYPE.Voice;
  }
  if (normalized === "4" || normalized === "video") return PROLUOFIRE_IM_CONTENT_TYPE.Video;
  if (normalized === "5" || normalized === "file") return PROLUOFIRE_IM_CONTENT_TYPE.File;
  return null;
}

function resolveAttachmentType(contentType: ProluofireImContentType | null): string {
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Image) return "image";
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Voice) return "audio";
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Video) return "video";
  return "file";
}

function resolveMediaPlaceholder(contentType: ProluofireImContentType | null): string {
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Image) return "<media:image>";
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Voice) return "<media:audio>";
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.Video) return "<media:video>";
  if (contentType === PROLUOFIRE_IM_CONTENT_TYPE.File) return "<media:file>";
  return "";
}

function parseContentRecord(rawContent: string): Record<string, unknown> | null {
  const trimmed = rawContent.trim();
  if (!trimmed || !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildMediaAttachments(params: {
  messagePayload: Record<string, unknown>;
  contentRecord: Record<string, unknown> | null;
  contentType: ProluofireImContentType | null;
  messageId: string;
}): ProluofireImAttachment[] {
  const { messagePayload, contentRecord, contentType, messageId } = params;
  const source = contentRecord ?? {};
  const fileUrl =
    readString(messagePayload, ["file_url", "fileUrl"]) ||
    readString(source, ["file_url", "fileUrl"]) ||
    readString(messagePayload, ["thumbnail_url", "thumbnailUrl"]) ||
    readString(source, ["thumbnail_url", "thumbnailUrl"]);
  if (!fileUrl) return [];

  const fileName =
    readString(messagePayload, ["file_name", "fileName"]) ||
    readString(source, ["file_name", "fileName"]);
  const fileSize =
    readInteger(messagePayload, ["file_size", "fileSize"]) ??
    readInteger(source, ["file_size", "fileSize"]);

  return [
    {
      id: messageId ? `${messageId}:0` : `media_${Date.now()}`,
      type: resolveAttachmentType(contentType),
      url: fileUrl,
      filename: fileName || undefined,
      size: typeof fileSize === "number" && fileSize > 0 ? fileSize : undefined,
    },
  ];
}

function parseTimestamp(value: unknown, fallback?: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return Math.trunc(value);
    if (value > 1_000_000_000) return Math.trunc(value * 1000);
  }
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    if (fallback > 1_000_000_000_000) return Math.trunc(fallback);
    if (fallback > 1_000_000_000) return Math.trunc(fallback * 1000);
  }
  const raw = typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
  if (raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function parseInboundMessage(payload: unknown): ProluofireImMessage | null {
  if (!isRecord(payload)) return null;

  const envelope = isRecord(payload.data) ? payload.data : payload;
  const messagePayload = isRecord(envelope.payload)
    ? envelope.payload
    : isRecord(payload.payload)
      ? payload.payload
      : envelope;
  if (!isRecord(messagePayload)) return null;

  const eventType = readString(envelope, ["eventType"]) || readString(payload, ["eventType"]);
  if (eventType && eventType !== "ImMessageEvent") return null;

  const messageTypeRaw =
    readString(messagePayload, ["messageType", "message_type"]) ||
    normalizeId(messagePayload.messageType ?? messagePayload.message_type);
  if (messageTypeRaw) {
    const normalizedMessageType = messageTypeRaw.toLowerCase();
    if (normalizedMessageType !== "user" && normalizedMessageType !== "1") {
      return null;
    }
  }

  if (messagePayload.isWithdraw === true || messagePayload.is_withdraw === true) return null;

  const contentType = parseContentType(messagePayload.contentType ?? messagePayload.content_type);
  const roomId = normalizeId(messagePayload.roomId ?? messagePayload.room_id);
  const rawUserId = normalizeId(
    messagePayload.userId ??
      messagePayload.user_id ??
      messagePayload.fromUid ??
      messagePayload.from_uid,
  );
  const currentUid = normalizeId(envelope.uid ?? payload.uid);
  const userId = rawUserId || currentUid;
  if (!roomId || !userId) return null;

  const messageId =
    normalizeId(messagePayload.id) ||
    normalizeId(messagePayload.messageId ?? messagePayload.message_id) ||
    normalizeId(envelope.refId ?? envelope.ref_id);
  const replyMessageId = parseReplyMessageId(
    messagePayload.replyMessageId ?? messagePayload.reply_message_id,
  );

  const rawContent = typeof messagePayload.content === "string" ? messagePayload.content : "";
  const contentRecord = parseContentRecord(rawContent);
  const attachments = buildMediaAttachments({
    messagePayload,
    contentRecord,
    contentType,
    messageId: messageId || `ws_${Date.now()}`,
  });
  const mediaPlaceholder = resolveMediaPlaceholder(contentType);
  const content =
    contentType === PROLUOFIRE_IM_CONTENT_TYPE.Text
      ? rawContent
      : rawContent.trim() && !contentRecord
        ? rawContent
        : mediaPlaceholder || (attachments.length > 0 ? "<media:file>" : "");
  if (!content.trim() && attachments.length === 0) return null;

  const envelopeType = readString(payload, ["messageType", "message_type"]);
  const roomType = readString(messagePayload, ["roomType", "room_type", "chatType", "chat_type"]);
  const forceGroup =
    envelopeType.toLowerCase() === "imgroupeventinbox" ||
    /group|room|channel/.test(roomType.toLowerCase());
  const to = forceGroup ? `#${roomId}` : "";

  return {
    id: messageId || `ws_${Date.now()}`,
    from: `user:${userId}`,
    to,
    content,
    attachments,
    roomId,
    userId,
    selfUid: currentUid,
    timestamp: parseTimestamp(
      messagePayload.createdAt ?? messagePayload.created_at,
      envelope.createdAt ?? envelope.created_at,
    ),
    replyToId: replyMessageId > 0 ? String(replyMessageId) : undefined,
  };
}

function resolveWsUrl(params: { serverUrl: string; wsUrl?: string; token?: string }): string {
  const token = params.token?.trim();
  if (!token) {
    throw new Error("Missing API key for WebSocket connection");
  }

  const base = params.wsUrl?.trim();
  const wsBase = base || params.serverUrl.trim();
  if (!wsBase) throw new Error("WebSocket URL is required");

  const url = new URL(wsBase);
  if (!base) {
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:") url.protocol = "ws:";
    const cleanPath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${cleanPath}/ws`;
  }

  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Create and initialize a proluofire-im client using REST API
 *
 * proluofire-im uses:
 * - REST API with Bearer Token authentication
 * - JSON format for requests/responses
 * - WebSocket for receiving messages
 */
export async function createProluofireImClient(params: {
  serverUrl: string;
  wsUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}): Promise<ProluofireImClient> {
  const { serverUrl, wsUrl, apiKey, username, password } = params;

  const bearerToken = apiKey?.trim() || "";
  const basicAuth =
    !bearerToken && username && password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
      : "";

  let connected = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempt = 0;
  let closing = false;
  const messageHandlers: Array<(message: ProluofireImMessage) => void> = [];
  const statusHandlers: Array<(status: ConnectionStatus) => void> = [];

  const baseUrl = serverUrl.trim().replace(/\/+$/, "");

  function buildUrl(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${baseUrl}${path}`;
  }

  function updateStatus(status: ConnectionStatus) {
    statusHandlers.forEach((handler) => handler(status));
  }

  function scheduleReconnect() {
    if (closing) return;
    reconnectAttempt += 1;
    const delay = Math.min(
      WS_RECONNECT_BASE_MS * Math.pow(1.7, reconnectAttempt - 1),
      WS_RECONNECT_MAX_MS,
    );
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      void connectWebSocket().catch(() => {
        scheduleReconnect();
      });
    }, delay);
  }

  async function connectWebSocket(): Promise<void> {
    if (closing) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (ws && ws.readyState === WebSocket.CONNECTING) return;

    const wsAddress = resolveWsUrl({ serverUrl, wsUrl, token: bearerToken });
    console.log(`[proluofire-im] connecting to WS: ${wsAddress}`);
    ws = new WebSocket(wsAddress);

    let heartbeatTimer: NodeJS.Timeout | null = null;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let opened = false;

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const finishReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        // Send initial ping immediately
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
        heartbeatTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 15000); // 15s heartbeat
      };

      ws?.on("open", () => {
        console.log("[proluofire-im] WS connected");
        opened = true;
        connected = true;
        reconnectAttempt = 0;
        updateStatus({ connected: true });
        startHeartbeat();
        finishResolve();
      });

      ws?.on("message", (data) => {
        const raw = rawDataToString(data);
        if (raw === "pong") return;
        console.log(`[proluofire-im] raw WS message:`, raw);
        // Handle pong/heartbeat response if needed
        if (raw === "pong") return;

        let parsed: unknown;
        try {
          const safeRaw = stringifyLargeIntegers(raw);
          parsed = JSON.parse(safeRaw) as unknown;
        } catch {
          return;
        }
        const message = parseInboundMessage(parsed);
        if (!message) return;
        messageHandlers.forEach((handler) => handler(message));
      });

      ws?.on("close", (code, reason) => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        const errText = reason.toString("utf8");
        console.log(`[proluofire-im] WS closed: code=${code}, reason=${errText}`);
        connected = false;
        updateStatus({ connected: false, error: errText || undefined });
        if (!closing) scheduleReconnect();
        if (!opened) {
          finishReject(new Error(`WebSocket closed before open (code ${code})`));
          return;
        }
        finishResolve();
      });

      ws?.on("error", (err) => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        console.log(`[proluofire-im] WS error: ${error.message}`);
        if (!connected) {
          updateStatus({ connected: false, error: error.message });
          finishReject(error);
          return;
        }
        updateStatus({ connected: true, error: error.message });
      });
    });
  }

  /**
   * Make HTTP request to proluofire-im API
   */
  async function makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = buildUrl(endpoint);
    const authHeader = bearerToken ? `Bearer ${bearerToken}` : basicAuth || undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  }

  const client: ProluofireImClient = {
    async connect() {
      try {
        if (!bearerToken && !(username && password)) {
          throw new Error("Missing API key or username/password");
        }
        closing = false;
        await connectWebSocket();
      } catch (error) {
        connected = false;
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateStatus({ connected: false, error: errorMsg });
        throw new Error(`Failed to connect to proluofire-im: ${errorMsg}`);
      }
    },

    async disconnect() {
      try {
        closing = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
        connected = false;
        updateStatus({ connected: false });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to disconnect from proluofire-im: ${errorMsg}`);
      }
    },

    async sendMessage(target, content, options) {
      if (!connected) {
        throw new Error("Client not connected");
      }

      try {
        const roomId = resolveRoomIdFromTarget(target);
        const replyMessageId = parseReplyMessageId(options?.replyToId);
        const localId = options?.localId?.trim() || buildLocalId();
        const numericRoomId = /^\d+$/.test(roomId) ? roomId : "";
        const contentType = options?.contentType ?? PROLUOFIRE_IM_CONTENT_TYPE.Text;
        const messageContent = content ?? "";
        if (!messageContent.trim() && contentType === PROLUOFIRE_IM_CONTENT_TYPE.Text) {
          throw new Error("Message content is required");
        }
        const requestBody = {
          room_id: numericRoomId ? `__room_id__${numericRoomId}__` : roomId,
          local_id: localId,
          content_type: contentType,
          content: messageContent,
          reply_message_id: replyMessageId,
        };
        let body = JSON.stringify(requestBody);
        if (numericRoomId) {
          body = body.replace(
            `"room_id":"__room_id__${numericRoomId}__"`,
            `"room_id":${numericRoomId}`,
          );
        }
        console.log(
          `[proluofire-im] send_message request: ${JSON.stringify({
            endpoint: "/api/messages/send_message",
            body,
          })}`,
        );
        const response = await makeRequest("/api/messages/send_message", {
          method: "POST",
          body,
        });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const dataPayload = isRecord(payload.data) ? payload.data : {};
        const messageId =
          normalizeId(dataPayload.id) ||
          normalizeId(dataPayload.messageId) ||
          normalizeId(payload.messageId) ||
          normalizeId(payload.id) ||
          localId;
        return messageId;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to send message: ${errorMsg}`);
      }
    },

    onMessage(handler) {
      messageHandlers.push(handler);
    },

    onConnectionStatus(handler) {
      statusHandlers.push(handler);
    },
  };

  // Expose internal methods for webhook use (fallback).
  const internal = client as ProluofireImClientInternal;
  internal._triggerMessage = (message: ProluofireImMessage) => {
    messageHandlers.forEach((handler) => handler(message));
  };

  internal._triggerStatus = (status: ConnectionStatus) => {
    statusHandlers.forEach((handler) => handler(status));
  };

  return client;
}

/**
 * Reconnect with exponential backoff
 */
export async function reconnectWithBackoff(
  client: ProluofireImClient,
  attempt: number,
  maxAttempts: number,
): Promise<void> {
  if (attempt >= maxAttempts) {
    throw new Error(`Failed to reconnect after ${maxAttempts} attempts`);
  }

  const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  console.log(
    `[proluofire-im] Reconnecting in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})...`,
  );

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  try {
    await client.connect();
  } catch (error) {
    console.error(`[proluofire-im] Reconnect attempt ${attempt + 1} failed:`, error);
    return reconnectWithBackoff(client, attempt + 1, maxAttempts);
  }
}

/**
 * Resolve proluofire-im authentication from config
 */
export async function resolveProluofireImAuth(params: {
  cfg: CoreConfig;
  accountId?: string;
}): Promise<{
  serverUrl: string;
  wsUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}> {
  const { cfg, accountId } = params;
  const account = resolveProluofireImAccount({
    cfg,
    accountId: accountId ?? undefined,
  });
  if (!account.configured) {
    throw new Error("Proluofire IM account not configured");
  }
  const serverUrl = account.serverUrl?.trim();
  if (!serverUrl) {
    throw new Error("Proluofire IM server URL not configured");
  }
  return {
    serverUrl,
    wsUrl: account.config.wsUrl,
    apiKey: account.apiKey,
    username: account.username,
    password: account.password,
  };
}
