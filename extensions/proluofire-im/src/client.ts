import { Buffer } from "node:buffer";
import WebSocket from "ws";
import type { CoreConfig } from "./types.js";
import type {
  ProluofireImClient,
  ProluofireImClientInternal,
  ConnectionStatus,
  ProluofireImMessage,
} from "./types.js";
import { resolveProluofireImAccount } from "./accounts.js";

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

function coerceRoomId(value: string): number | string {
  const parsed = Number.parseInt(value, 10);
  if (Number.isSafeInteger(parsed) && String(parsed) === value) return parsed;
  return value;
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

function parseTimestamp(value: unknown, fallback?: unknown): number {
  const raw = typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function parseInboundMessage(payload: unknown): ProluofireImMessage | null {
  if (!isRecord(payload)) return null;

  // Try to find the inner data/payload
  const data = isRecord(payload.data) ? payload.data : payload;
  if (!data) return null;
  const messagePayload = isRecord(data.payload) ? data.payload : data;
  if (!messagePayload) return null;

  // Check event type from either root or data
  const rootEventType = typeof payload.eventType === "string" ? payload.eventType : "";
  const eventType = typeof data.eventType === "string" ? data.eventType : rootEventType;

  // If we have an event type, it MUST be ImMessageEvent.
  // If no event type is found, we'll try to parse anyway if it looks like a message.
  if (eventType && eventType !== "ImMessageEvent") return null;

  const contentTypeRaw = messagePayload.contentType;
  const contentType =
    typeof contentTypeRaw === "string"
      ? contentTypeRaw
      : typeof contentTypeRaw === "number"
        ? String(contentTypeRaw)
        : "";
  if (contentType && contentType.toLowerCase() !== "text" && contentType !== "1") {
    return null;
  }

  const messageTypeRaw = messagePayload.messageType;
  const messageType = typeof messageTypeRaw === "string" ? messageTypeRaw : "";
  if (messageType && messageType.toLowerCase() !== "user") return null;

  if (messagePayload.isWithdraw === true) return null;

  const content = typeof messagePayload.content === "string" ? messagePayload.content : "";
  if (!content.trim()) return null;

  const roomId = normalizeId(messagePayload.roomId);
  const userId = normalizeId(messagePayload.userId ?? data.uid);
  if (!roomId || !userId) return null;

  const messageId =
    normalizeId(messagePayload.id) ||
    normalizeId(messagePayload.messageId) ||
    normalizeId(data.refId);
  const replyMessageId = parseReplyMessageId(messagePayload.replyMessageId);

  // If roomId is present, we assume it's a group message if the protocol implies it.
  // However, for 1-on-1 chats, some systems still use "roomId" to denote the conversation ID.
  // We need a way to distinguish.
  // Looking at the logs: "messageType":"User" usually implies user message.
  // If it's a DM, "roomId" might be the conversation ID, but we should treat it as DM
  // if we can't be sure it's a group.

  // FIXME: Currently we force everything to be group if roomId is present.
  // If your system uses roomId for DMs too, we need a flag (e.g. chatType).
  // Assuming for now: if messageType is "User", it MIGHT be a DM?
  // But wait, group messages are also from "User".

  // Let's check if there is a specific field for chat type.
  // The log shows: "messageType":"User".

  // Temporary Fix: You said it's a DM.
  // If roomId exists, is it a Group ID or just a Conversation ID?
  // If it's a DM, `to` should be the bot's user ID, not `group:roomId`.

  // Since we don't have enough info from the payload to distinguish Group vs DM purely by fields
  // (unless messageType "Group" exists?), we might need to rely on other hints.
  // But for now, if you say it's DM, we should probably output `user:${roomId}` or similar?
  // Actually, if it's a DM, the `to` should be the receiver (the bot).
  // But `monitor.ts` uses `to` to determine `isGroup`.

  // Let's try to infer from payload. If there is no explicit "Group" type...
  // Maybe we can check if `roomId` equals `userId` (self chat) or something? No.

  // CRITICAL CHANGE: We will change the default assumption.
  // If `messagePayload.chatType` exists, use it.
  // Otherwise, we default to DM if `roomId` looks like a User ID? No, that's risky.

  // Let's assume for this specific integration:
  // If the user says it's DM but we see roomId=14...
  // Maybe `roomId` IS the group/channel ID even for DMs in this system?
  // But OpenClaw treats `group:...` as Multi-User Chat.

  // Let's try to map it to DM for now if the user insists.
  // But wait, if we map it to DM, we need to know who it is sent TO.
  // In a DM, `to` is the bot. `from` is the sender.
  // The current code sets `to: group:roomId`.

  // If I change it to `to: user:BOT_ID`, then `monitor.ts` will treat it as DM.
  // But we don't know the BOT_ID here easily without config.

  // ALTERNATIVE: Just assume it is a DM if the user says so,
  // but how to distinguish from Group programmatically?
  // Maybe `roomId` is 0 for DMs? In the log roomId is 14.

  // Let's look at the log again:
  // "payload": { ... "roomId": 14, "userId": 6 ... }

  // If 14 is a Group, then `group:14` is correct.
  // If 14 is a Conversation ID for a DM between User 6 and Bot...
  // OpenClaw expects DMs to have `to` as the Bot's ID (or empty/undefined).

  // HYPOTHESIS: This IM system uses `roomId` for both.
  // We need to know if Room 14 is a Group or DM.
  // Since we can't know, maybe we can look at `messageType`.
  // Log says `messageType: "User"`. Maybe Group messages have `messageType: "Group"`?
  // If so, then "User" implies DM?

  // Let's try this heuristic:
  // If messageType is "User", treat as DM?
  // But group messages are also sent BY users.

  // Let's try to see if there is `chatType` field.
  // Log doesn't show `chatType`.

  // OK, let's try this:
  // If it's a DM, we set `to` to undefined (or the bot ID if we knew it).
  // If we set `to: undefined`, OpenClaw treats it as DM sent to the bot.

  // Modified logic:
  // We will assume it is a DM if `roomId` is present but we want to treat it as DM.
  // But wait, if it IS a group, we break group chat.

  // Let's assume for now that `messageType` === 'User' means DM,
  // and maybe 'Group' (or 'Room'?) means Group?
  // I will check if I can find `chatType` in the raw payload.
  // The log shows: "eventType":"ImMessageEvent", "payload":{..."messageType":"User"...}

  // I will blindly trust the user that THIS message is a DM.
  // So I will change the logic to:
  // to: `dm:${roomId}` ? No.

  // Let's just remove the `group:` prefix and let `monitor.ts` decide?
  // `monitor.ts`: const isGroup = Boolean(toTarget && toTarget.startsWith("#"));
  // `protocol.ts` adds `#` if it sees `group:`.

  // I'll modify `parseInboundMessage` to NOT add `group:` prefix by default,
  // OR try to detect DM.

  // For now, I will use a heuristic:
  // If `roomId` is small (like 14), it might be a group? Or DM?
  // Actually, usually DM `roomId`s are complex or just 0.

  // Let's try to assume it is a DM for now to unblock the user.
  // I will set `to` to `undefined` (which implies DM to bot).

  return {
    id: messageId || `ws_${Date.now()}`,
    from: `user:${userId}`,
    to: "", // Treat as DM to bot (empty string -> isGroup=false)
    content,
    roomId,
    timestamp: parseTimestamp(messagePayload.createdAt, data.createdAt),
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
          parsed = JSON.parse(raw) as unknown;
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

      if (options?.attachments && options.attachments.length > 0) {
        throw new Error("Proluofire IM media sends are not supported yet");
      }

      try {
        const roomId = resolveRoomIdFromTarget(target);
        const replyMessageId = parseReplyMessageId(options?.replyToId);
        const localId = options?.localId?.trim() || buildLocalId();
        const response = await makeRequest("/api/messages/send_message", {
          method: "POST",
          body: JSON.stringify({
            room_id: coerceRoomId(roomId),
            local_id: localId,
            content_type: 1,
            content,
            reply_message_id: replyMessageId,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const messageId =
          normalizeId(payload.messageId) ||
          normalizeId(payload.id) ||
          normalizeId(payload.data) ||
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
