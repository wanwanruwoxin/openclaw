import type { CoreConfig } from "./types.js";
import type { ProluofireImClient, ConnectionStatus, ProluofireImMessage } from "./types.js";

/**
 * Create and initialize a proluofire-im client using REST API
 *
 * proluofire-im uses:
 * - REST API with Bearer Token authentication
 * - JSON format for requests/responses
 * - Webhook for receiving messages
 */
export async function createProluofireImClient(params: {
  serverUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
}): Promise<ProluofireImClient> {
  const { serverUrl, apiKey, username, password } = params;

  // For REST API, we use apiKey as Bearer token
  const bearerToken = apiKey || "";

  let connected = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const messageHandlers: Array<(message: ProluofireImMessage) => void> = [];
  const statusHandlers: Array<(status: ConnectionStatus) => void> = [];

  /**
   * Make HTTP request to proluofire-im API
   */
  async function makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${serverUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
      ...options.headers,
    };

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
        console.log(`[proluofire-im] Connecting to ${serverUrl}...`);

        // TODO: 测试连接 - 调用一个简单的 API 端点来验证认证
        // 例如: GET /api/v1/auth/verify 或 GET /api/v1/user/me
        // const response = await makeRequest('/api/v1/auth/verify', { method: 'GET' });
        // const data = await response.json();

        // 暂时模拟连接成功
        connected = true;
        reconnectAttempts = 0;

        statusHandlers.forEach((handler) => handler({ connected: true }));

        console.log(`[proluofire-im] Connected successfully`);
      } catch (error) {
        connected = false;
        const errorMsg = error instanceof Error ? error.message : String(error);
        statusHandlers.forEach((handler) => handler({ connected: false, error: errorMsg }));
        throw new Error(`Failed to connect to proluofire-im: ${errorMsg}`);
      }
    },

    async disconnect() {
      try {
        console.log(`[proluofire-im] Disconnecting...`);

        // REST API 通常不需要显式断开连接
        connected = false;
        statusHandlers.forEach((handler) => handler({ connected: false }));

        console.log(`[proluofire-im] Disconnected`);
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
        // TODO: 调用发送消息的 API 端点
        // 根据你的 API 设计，可能是这样的格式：
        // POST /api/v1/messages
        // Body: { to: target, content: content, threadId: options?.threadId, ... }
        //
        // const response = await makeRequest('/api/v1/messages', {
        //   method: 'POST',
        //   body: JSON.stringify({
        //     to: target,
        //     content: content,
        //     threadId: options?.threadId,
        //     replyToId: options?.replyToId,
        //     attachments: options?.attachments
        //   })
        // });

        console.log(`[proluofire-im] Sending message to ${target}: ${content.substring(0, 50)}...`);

        // 暂时模拟发送成功
        // 实际实现时取消注释上面的代码
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to send message: ${errorMsg}`);
      }
    },

    onMessage(handler) {
      messageHandlers.push(handler);
      // 注意: REST API + Webhook 模式下，消息通过 webhook 接收
      // 这个 handler 会在 webhook 服务器收到消息时被调用
    },

    onConnectionStatus(handler) {
      statusHandlers.push(handler);
    },
  };

  // 暴露内部方法供 webhook 使用
  (client as any)._triggerMessage = (message: ProluofireImMessage) => {
    messageHandlers.forEach((handler) => handler(message));
  };

  (client as any)._triggerStatus = (status: ConnectionStatus) => {
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
  console.log(`[proluofire-im] Reconnecting in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})...`);

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
export async function resolveProluofireImAuth(params: { cfg: CoreConfig }): Promise<{
  serverUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
}> {
  const { cfg } = params;
  const channelConfig = cfg.channels?.proluofireIm;

  if (!channelConfig) {
    throw new Error("Proluofire IM not configured");
  }

  const serverUrl = channelConfig.serverUrl;
  if (!serverUrl) {
    throw new Error("Proluofire IM server URL not configured");
  }

  return {
    serverUrl,
    apiKey: channelConfig.apiKey,
    username: channelConfig.username,
    password: channelConfig.password,
  };
}
