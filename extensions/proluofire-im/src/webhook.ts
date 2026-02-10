import type { ProluofireImClientInternal, ProluofireImMessage } from "./types.js";
import { normalizeTarget } from "./protocol.js";

/**
 * Webhook handler for receiving messages from proluofire-im
 *
 * proluofire-im 会通过 HTTP POST 请求发送消息到这个 webhook
 *
 * 使用方法:
 * 1. 在 proluofire-im 后台配置 webhook URL
 * 2. OpenClaw gateway 会自动启动 webhook 服务器
 * 3. 收到消息后会触发 message handlers
 */

// 存储客户端实例，用于触发消息处理
const clientInstances = new Map<string, ProluofireImClientInternal>();

/**
 * 注册客户端实例供 webhook 使用
 */
export function registerClientForWebhook(
  accountId: string,
  client: ProluofireImClientInternal,
): void {
  clientInstances.set(accountId, client);
}

/**
 * 注销客户端实例
 */
export function unregisterClientForWebhook(accountId: string): void {
  clientInstances.delete(accountId);
}

/**
 * 处理 webhook 请求
 *
 * TODO: 根据你的 proluofire-im webhook 格式调整
 *
 * 典型的 webhook payload 可能是:
 * {
 *   "event": "message.new",
 *   "message": {
 *     "id": "msg_123",
 *     "from": "@user1",
 *     "to": "@bot",
 *     "content": "Hello",
 *     "timestamp": 1234567890,
 *     "threadId": "thread_456",
 *     "attachments": [...]
 *   }
 * }
 */
export async function handleWebhookRequest(params: {
  accountId: string;
  payload: unknown;
  headers: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const { accountId, payload, headers } = params;
  void headers;

  try {
    // TODO: 验证 webhook 签名（如果 proluofire-im 提供）
    // 例如: HMAC 签名验证
    // const signature = headers['x-proluofire-signature'];
    // if (!verifyWebhookSignature(payload, signature)) {
    //   return { success: false, error: 'Invalid signature' };
    // }

    // TODO: 解析 webhook payload
    // 根据你的 proluofire-im webhook 格式调整
    const record =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const event =
      typeof record.event === "string"
        ? record.event
        : typeof record.type === "string"
          ? record.type
          : "";

    if (event === "message.new" || event === "message") {
      // 提取消息数据
      const messageData =
        record.message && typeof record.message === "object"
          ? (record.message as Record<string, unknown>)
          : record.data && typeof record.data === "object"
            ? (record.data as Record<string, unknown>)
            : record;

      // 转换为标准格式
      const from = normalizeTarget(
        typeof messageData.from === "string"
          ? messageData.from
          : typeof messageData.sender === "string"
            ? messageData.sender
            : "",
      );
      const to = normalizeTarget(
        typeof messageData.to === "string"
          ? messageData.to
          : typeof messageData.recipient === "string"
            ? messageData.recipient
            : "",
      );
      const rawId =
        typeof messageData.id === "string" || typeof messageData.id === "number"
          ? messageData.id
          : typeof messageData.messageId === "string" || typeof messageData.messageId === "number"
            ? messageData.messageId
            : undefined;
      const rawTimestamp =
        typeof messageData.timestamp === "number"
          ? messageData.timestamp
          : typeof messageData.timestamp === "string"
            ? Number(messageData.timestamp)
            : undefined;
      const threadId = typeof messageData.threadId === "string" ? messageData.threadId : undefined;
      const replyToId =
        typeof messageData.replyToId === "string"
          ? messageData.replyToId
          : typeof messageData.replyTo === "string"
            ? messageData.replyTo
            : undefined;
      const roomId =
        typeof messageData.roomId === "string" || typeof messageData.roomId === "number"
          ? String(messageData.roomId)
          : typeof messageData.room_id === "string" || typeof messageData.room_id === "number"
            ? String(messageData.room_id)
            : undefined;
      const content =
        typeof messageData.content === "string"
          ? messageData.content
          : typeof messageData.text === "string"
            ? messageData.text
            : "";
      const attachments = Array.isArray(messageData.attachments)
        ? (messageData.attachments as ProluofireImMessage["attachments"])
        : [];
      const message: ProluofireImMessage = {
        id: rawId ? String(rawId) : String(Date.now()),
        from,
        to,
        content,
        timestamp: Number.isFinite(rawTimestamp ?? NaN) ? Number(rawTimestamp) : Date.now(),
        roomId,
        threadId,
        replyToId,
        attachments,
      };

      // 触发消息处理
      const client = clientInstances.get(accountId);
      if (client?._triggerMessage) {
        client._triggerMessage(message);
      } else {
        console.warn(`[proluofire-im] No client registered for account ${accountId}`);
      }

      return { success: true };
    }

    // 其他事件类型
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

// TODO: Implement webhook signature verification when proluofire-im exposes a signing scheme.
