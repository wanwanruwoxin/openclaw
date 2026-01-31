import { createProluofireImClient, resolveProluofireImAuth } from "./client.js";
import { encodeMessage, convertMarkdownToProluofireIm, convertMentionsToProluofireIm, normalizeTarget } from "./protocol.js";
import { markOutboundMessage } from "./runtime.js";
import type { CoreConfig, SendMessageOptions } from "./types.js";

// Rate limiting state
const rateLimitState = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 20; // Max messages per window

/**
 * Send a message via proluofire-im
 *
 * TODO: Integrate with actual proluofire-im SDK for message sending
 */
export async function sendMessageProluofireIm(
  target: string,
  content: string,
  options?: SendMessageOptions,
): Promise<void> {
  try {
    // Normalize target
    const normalizedTarget = normalizeTarget(target);

    // Check rate limit
    await checkRateLimit(normalizedTarget);

    // Encode and format message
    const encodedContent = encodeMessage(content);
    const formattedContent = convertMarkdownToProluofireIm(encodedContent);
    const finalContent = convertMentionsToProluofireIm(formattedContent);

    // TODO: Get client instance and send message
    // This is a stub - replace with actual implementation
    console.log(`[proluofire-im] Sending message to ${normalizedTarget}: ${finalContent.substring(0, 50)}...`);

    // TODO: Implement actual sending logic
    // const client = await getOrCreateClient();
    // await client.sendMessage(normalizedTarget, finalContent, options);

    // Update rate limit
    updateRateLimit(normalizedTarget);

    // Mark outbound message (for status tracking)
    markOutboundMessage("default");
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
  options?: SendMessageOptions,
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
  options?: SendMessageOptions,
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
  options?: SendMessageOptions,
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
        console.log(`[proluofire-im] Retry attempt ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
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
  if (message.includes("network") || message.includes("timeout") || message.includes("econnrefused")) {
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

/**
 * Send message with media attachments
 *
 * TODO: Implement media attachment handling
 * - Upload media files first (see media.ts)
 * - Include attachment references in message
 */
export async function sendMessageWithMedia(
  target: string,
  content: string,
  attachments: Array<{ path: string; type: string }>,
  options?: SendMessageOptions,
): Promise<void> {
  try {
    // TODO: Upload attachments and get references
    // const uploadedAttachments = await Promise.all(
    //   attachments.map(att => uploadMedia(att.path, att.type))
    // );

    // TODO: Send message with attachment references
    // await sendMessageProluofireIm(target, content, {
    //   ...options,
    //   attachments: uploadedAttachments
    // });

    console.log(`[proluofire-im] Sending message with ${attachments.length} attachments to ${target}`);

    // Stub: send without attachments for now
    await sendMessageProluofireIm(target, content, options);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send message with media: ${errorMsg}`);
  }
}
