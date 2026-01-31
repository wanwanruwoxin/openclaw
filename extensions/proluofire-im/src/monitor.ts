import type { ProluofireImClient, ProluofireImMessage, CoreConfig } from "./types.js";
import { decodeMessage, extractMetadata } from "./protocol.js";
import { markInboundMessage, getProluofireImRuntime } from "./runtime.js";
import { registerClientForWebhook, unregisterClientForWebhook } from "./webhook.js";

/**
 * Monitor proluofire-im for incoming messages
 *
 * 使用 REST API + Webhook 模式:
 * 1. 注册客户端实例供 webhook 使用
 * 2. Webhook 收到消息后会触发 client.onMessage handlers
 * 3. 这里处理消息路由和安全策略
 */
export async function monitorProluofireImProvider(params: {
  client: ProluofireImClient;
  accountId: string;
  config: CoreConfig;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { client, accountId, config, abortSignal } = params;

  console.log(`[proluofire-im] Starting monitor for account ${accountId}`);

  // 注册客户端供 webhook 使用
  registerClientForWebhook(accountId, client);

  // Register message handler
  client.onMessage(async (message) => {
    try {
      await handleIncomingMessage({ message, accountId, config });
    } catch (error) {
      console.error(`[proluofire-im] Error handling message:`, error);
    }
  });

  // Register connection status handler
  client.onConnectionStatus((status) => {
    handleConnectionStatus({ status, accountId, client });
  });

  // Wait for abort signal
  await new Promise<void>((resolve) => {
    abortSignal.addEventListener("abort", () => {
      console.log(`[proluofire-im] Monitor stopped for account ${accountId}`);
      // 注销客户端
      unregisterClientForWebhook(accountId);
      resolve();
    });
  });
}

/**
 * Handle incoming message from proluofire-im
 */
async function handleIncomingMessage(params: {
  message: ProluofireImMessage;
  accountId: string;
  config: CoreConfig;
}): Promise<void> {
  const { message, accountId, config } = params;

  console.log(`[proluofire-im] Received message from ${message.from}: ${message.content.substring(0, 50)}...`);

  // Decode message
  const decoded = decodeMessage(message);
  const metadata = extractMetadata(message);

  // Determine if this is a DM or group message
  const isDM = !message.to.startsWith("#");

  // Check security policies
  if (isDM) {
    const allowed = await checkDmPolicy({
      from: message.from,
      config,
      accountId,
    });

    if (!allowed) {
      console.log(`[proluofire-im] DM from ${message.from} blocked by policy`);
      return;
    }
  } else {
    const allowed = await checkGroupPolicy({
      from: message.from,
      groupId: message.to,
      config,
      accountId,
    });

    if (!allowed) {
      console.log(`[proluofire-im] Group message from ${message.from} in ${message.to} blocked by policy`);
      return;
    }
  }

  // Route message to OpenClaw agent
  await routeMessageToAgent({
    content: decoded.content,
    from: decoded.from,
    to: message.to,
    timestamp: decoded.timestamp,
    threadId: metadata.threadId,
    replyToId: metadata.replyTo,
    accountId,
  });

  // Mark inbound message for status tracking
  markInboundMessage(accountId);
}

/**
 * Check DM policy for incoming message
 */
async function checkDmPolicy(params: {
  from: string;
  config: CoreConfig;
  accountId: string;
}): Promise<boolean> {
  const { from, config } = params;
  const channelConfig = config.channels?.proluofireIm;

  if (!channelConfig) {
    return false;
  }

  const dmPolicy = channelConfig.dm?.policy ?? "pairing";
  const allowFrom = channelConfig.dm?.allowFrom ?? [];

  switch (dmPolicy) {
    case "open":
      // Allow all DMs
      return true;

    case "allowlist":
      // Only allow from users in allowFrom list
      return allowFrom.some((entry) => {
        const normalized = String(entry).trim().toLowerCase();
        const fromNormalized = from.trim().toLowerCase();
        return normalized === fromNormalized || normalized === "*";
      });

    case "pairing":
      // Check if user is in allowFrom (approved via pairing)
      const isPaired = allowFrom.some((entry) => {
        const normalized = String(entry).trim().toLowerCase();
        const fromNormalized = from.trim().toLowerCase();
        return normalized === fromNormalized;
      });

      if (isPaired) {
        return true;
      }

      // TODO: Implement pairing flow
      // - Send pairing request notification
      // - Wait for approval
      // - Add to allowFrom list if approved
      console.log(`[proluofire-im] Pairing required for ${from} - not yet implemented`);
      return false;

    default:
      return false;
  }
}

/**
 * Check group policy for incoming message
 */
async function checkGroupPolicy(params: {
  from: string;
  groupId: string;
  config: CoreConfig;
  accountId: string;
}): Promise<boolean> {
  const { from, groupId, config } = params;
  const channelConfig = config.channels?.proluofireIm;

  if (!channelConfig) {
    return false;
  }

  const groupPolicy = channelConfig.groupPolicy ?? "allowlist";
  const groups = channelConfig.groups ?? {};
  const groupAllowFrom = channelConfig.groupAllowFrom ?? [];

  switch (groupPolicy) {
    case "open":
      // Allow all group messages (may still require mention)
      return true;

    case "allowlist":
      // Check if group is in allowlist
      const groupConfig = groups[groupId];
      if (!groupConfig) {
        return false;
      }

      // Check if user is allowed in this group
      const users = groupConfig.users ?? [];
      if (users.length === 0) {
        // No user restriction for this group
        return true;
      }

      // Check if user is in group's user list
      return users.some((entry) => {
        const normalized = String(entry).trim().toLowerCase();
        const fromNormalized = from.trim().toLowerCase();
        return normalized === fromNormalized || normalized === "*";
      });

    default:
      return false;
  }
}

/**
 * Route message to OpenClaw agent
 */
async function routeMessageToAgent(params: {
  content: string;
  from: string;
  to: string;
  timestamp: number;
  threadId?: string;
  replyToId?: string;
  accountId: string;
}): Promise<void> {
  const { content, from, to, timestamp, threadId, replyToId, accountId } = params;

  try {
    const runtime = getProluofireImRuntime();

    // TODO: Use OpenClaw's message routing API
    // This is a placeholder - replace with actual routing
    console.log(`[proluofire-im] Routing message to agent:`, {
      from,
      to,
      content: content.substring(0, 50) + "...",
      threadId,
      replyToId,
    });

    // Example of what the actual implementation might look like:
    // await runtime.routeMessage({
    //   channel: "proluofire-im",
    //   accountId,
    //   from,
    //   to,
    //   content,
    //   timestamp,
    //   context: {
    //     threadId,
    //     replyToId,
    //   },
    // });
  } catch (error) {
    console.error(`[proluofire-im] Failed to route message:`, error);
    throw error;
  }
}

/**
 * Handle connection status changes
 */
function handleConnectionStatus(params: {
  status: { connected: boolean; error?: string };
  accountId: string;
  client: ProluofireImClient;
}): void {
  const { status, accountId, client } = params;

  if (status.connected) {
    console.log(`[proluofire-im] Connected for account ${accountId}`);
  } else {
    console.log(`[proluofire-im] Disconnected for account ${accountId}`, status.error);

    // TODO: Implement reconnection logic
    // - Wait with exponential backoff
    // - Attempt to reconnect
    // - Update runtime state
  }
}

/**
 * Handle typing indicators (if supported by proluofire-im)
 *
 * TODO: Implement typing indicator handling if proluofire-im supports it
 */
export function handleTypingIndicator(params: {
  from: string;
  to: string;
  typing: boolean;
}): void {
  const { from, to, typing } = params;

  // TODO: Forward typing indicator to OpenClaw if needed
  console.log(`[proluofire-im] Typing indicator: ${from} in ${to} - ${typing ? "typing" : "stopped"}`);
}
