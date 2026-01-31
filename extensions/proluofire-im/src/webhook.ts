import type { ProluofireImMessage } from "./types.js";
import { decodeMessage, extractMetadata } from "./protocol.js";
import { markInboundMessage } from "./runtime.js";

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
const clientInstances = new Map<string, any>();

/**
 * 注册客户端实例供 webhook 使用
 */
export function registerClientForWebhook(accountId: string, client: any): void {
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
  payload: any;
  headers: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const { accountId, payload, headers } = params;

  try {
    console.log(`[proluofire-im] Received webhook for account ${accountId}`);

    // TODO: 验证 webhook 签名（如果 proluofire-im 提供）
    // 例如: HMAC 签名验证
    // const signature = headers['x-proluofire-signature'];
    // if (!verifyWebhookSignature(payload, signature)) {
    //   return { success: false, error: 'Invalid signature' };
    // }

    // TODO: 解析 webhook payload
    // 根据你的 proluofire-im webhook 格式调整
    const event = payload.event || payload.type;

    if (event === "message.new" || event === "message") {
      // 提取消息数据
      const messageData = payload.message || payload.data || payload;

      // 转换为标准格式
      const message: ProluofireImMessage = {
        id: messageData.id || messageData.messageId || String(Date.now()),
        from: messageData.from || messageData.sender || "",
        to: messageData.to || messageData.recipient || "",
        content: messageData.content || messageData.text || "",
        timestamp: messageData.timestamp || Date.now(),
        threadId: messageData.threadId,
        replyToId: messageData.replyToId || messageData.replyTo,
        attachments: messageData.attachments || [],
      };

      // 触发消息处理
      const client = clientInstances.get(accountId);
      if (client && client._triggerMessage) {
        client._triggerMessage(message);
      } else {
        console.warn(`[proluofire-im] No client registered for account ${accountId}`);
      }

      return { success: true };
    }

    // 其他事件类型
    console.log(`[proluofire-im] Unhandled webhook event: ${event}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[proluofire-im] Webhook error:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * 验证 webhook 签名
 *
 * TODO: 根据 proluofire-im 的签名算法实现
 * 常见的方式:
 * - HMAC-SHA256
 * - JWT
 * - 简单的 secret token
 */
function verifyWebhookSignature(payload: any, signature: string): boolean {
  // TODO: 实现签名验证
  // 例如使用 HMAC:
  // const crypto = require('crypto');
  // const secret = process.env.PROLUOFIRE_WEBHOOK_SECRET;
  // const expectedSignature = crypto
  //   .createHmac('sha256', secret)
  //   .update(JSON.stringify(payload))
  //   .digest('hex');
  // return signature === expectedSignature;

  // 暂时返回 true（不验证）
  return true;
}

/**
 * 创建 webhook 服务器配置
 *
 * 返回 webhook 配置，供 OpenClaw gateway 使用
 */
export function getWebhookConfig(params: {
  accountId: string;
  port?: number;
  path?: string;
}): {
  port: number;
  path: string;
  handler: (req: any, res: any) => Promise<void>;
} {
  const { accountId, port = 3000, path = "/webhook/proluofire-im" } = params;

  return {
    port,
    path,
    async handler(req: any, res: any) {
      try {
        // 解析请求体
        let body = "";
        req.on("data", (chunk: any) => {
          body += chunk.toString();
        });

        await new Promise((resolve) => req.on("end", resolve));

        const payload = JSON.parse(body);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          headers[key] = String(value);
        }

        // 处理 webhook
        const result = await handleWebhookRequest({
          accountId,
          payload,
          headers,
        });

        // 返回响应
        res.statusCode = result.success ? 200 : 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error(`[proluofire-im] Webhook handler error:`, error);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: "Internal server error" }));
      }
    },
  };
}
