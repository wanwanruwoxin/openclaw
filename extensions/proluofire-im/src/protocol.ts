import type { ProluofireImMessage } from "./types.js";

function stripProluofireImPrefix(value: string): string {
  return value.replace(/^proluofire-im:/i, "").trim();
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

export function normalizeProluofireImAllowEntry(value: string): string {
  const trimmed = stripProluofireImPrefix(value);
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("user:")) {
    return lower.slice("user:".length).trim();
  }
  if (lower.startsWith("group:")) {
    return lower.slice("group:".length).trim();
  }
  const withoutPrefix =
    trimmed.startsWith("@") || trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutPrefix.trim().toLowerCase();
}

export function normalizeProluofireImUserId(value: string): string {
  const trimmed = stripProluofireImPrefix(value);
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("user:")) {
    return lower.slice("user:".length).trim();
  }
  const withoutPrefix = trimmed.replace(/^[@#]/, "");
  return withoutPrefix.trim().toLowerCase();
}

export function normalizeProluofireImGroupId(value: string): string {
  const trimmed = stripProluofireImPrefix(value);
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("group:")) {
    return lower.slice("group:".length).trim();
  }
  const withoutPrefix = trimmed.replace(/^[@#]/, "");
  return withoutPrefix.trim().toLowerCase();
}

export function formatProluofireImUserEntry(value: string): string {
  const normalized = normalizeProluofireImUserId(value);
  if (!normalized) return "";
  if (normalized === "*") return "*";
  return `@${normalized}`;
}

export function formatProluofireImGroupEntry(value: string): string {
  const normalized = normalizeProluofireImGroupId(value);
  if (!normalized) return "";
  if (normalized === "*") return "*";
  return `#${normalized}`;
}

/**
 * Encode OpenClaw message content to proluofire-im format
 *
 * TODO: Implement actual message encoding based on proluofire-im protocol
 * - Handle message format conversion
 * - Apply any protocol-specific encoding
 */
export function encodeMessage(content: string): string {
  // TODO: Replace with actual encoding logic
  // Example: convert to protocol-specific format, escape special characters, etc.
  return content;
}

/**
 * Decode proluofire-im message to OpenClaw format
 *
 * TODO: Implement actual message decoding based on proluofire-im protocol
 * - Parse protocol-specific message format
 * - Extract message content and metadata
 */
export function decodeMessage(message: ProluofireImMessage): {
  content: string;
  from: string;
  timestamp: number;
  threadId?: string;
  replyToId?: string;
} {
  const content = convertProluofireImToMarkdown(message.content);
  return {
    content,
    from: message.from,
    timestamp: message.timestamp,
    threadId: message.threadId,
    replyToId: message.replyToId,
  };
}

/**
 * Convert markdown to proluofire-im formatting
 *
 * TODO: Implement markdown conversion based on proluofire-im's supported formatting
 * - Check what formatting proluofire-im supports (bold, italic, code, etc.)
 * - Convert markdown syntax to proluofire-im format
 * - Fall back to plain text if formatting not supported
 */
export function convertMarkdownToProluofireIm(markdown: string): string {
  // TODO: Replace with actual markdown conversion
  // Options:
  // 1. If proluofire-im supports markdown natively, pass through
  // 2. If it uses different syntax, convert (e.g., *bold* to <b>bold</b>)
  // 3. If no formatting support, strip markdown and return plain text

  // Stub: pass through as-is
  return markdown;
}

/**
 * Convert proluofire-im formatting to markdown
 *
 * TODO: Implement formatting conversion from proluofire-im to markdown
 * - Parse proluofire-im's formatting syntax
 * - Convert to markdown equivalents
 */
export function convertProluofireImToMarkdown(formatted: string): string {
  // TODO: Replace with actual formatting conversion
  // Parse proluofire-im format and convert to markdown

  // Stub: pass through as-is
  return formatted;
}

/**
 * Extract and convert mentions in message
 *
 * TODO: Implement mention handling based on proluofire-im's mention format
 * - Identify mention syntax (e.g., @username, @[user:id], etc.)
 * - Convert between OpenClaw and proluofire-im mention formats
 */
export function extractMentions(content: string): string[] {
  // TODO: Replace with actual mention extraction
  // Example patterns to look for:
  // - @username
  // - @[User Name](user:id)
  // - <@userid>

  // Stub: simple @mention extraction
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Convert OpenClaw mentions to proluofire-im format
 *
 * TODO: Implement mention conversion to proluofire-im format
 */
export function convertMentionsToProluofireIm(content: string): string {
  // TODO: Replace with actual mention conversion
  // Convert OpenClaw mention format to proluofire-im format

  // Stub: pass through as-is
  return content;
}

/**
 * Extract metadata from proluofire-im message
 *
 * TODO: Implement metadata extraction based on proluofire-im message structure
 * - Extract reply-to information
 * - Extract thread information
 * - Extract reactions (if supported)
 * - Extract any other relevant metadata
 */
export function extractMetadata(message: ProluofireImMessage): {
  replyTo?: string;
  threadId?: string;
  reactions?: Array<{ emoji: string; users: string[] }>;
} {
  // TODO: Replace with actual metadata extraction
  // Parse message structure and extract metadata fields

  return {
    replyTo: message.replyToId,
    threadId: message.threadId,
    // reactions: message.reactions, // if supported
  };
}

/**
 * Resolve target identifier (user or group)
 *
 * TODO: Implement target resolution based on proluofire-im's identifier format
 * - Parse and validate user identifiers
 * - Parse and validate group/channel identifiers
 * - Handle different identifier formats (username, ID, etc.)
 */
export function resolveTarget(target: string): {
  type: "user" | "group";
  id: string;
  normalized: string;
} {
  const normalized = normalizeTarget(target);
  if (!normalized) {
    throw new Error("Target cannot be empty");
  }

  if (normalized.startsWith("#")) {
    return {
      type: "group",
      id: normalized.slice(1),
      normalized,
    };
  }

  if (normalized.startsWith("@")) {
    return {
      type: "user",
      id: normalized.slice(1),
      normalized,
    };
  }

  // Default to group for numeric room IDs.
  if (isNumericId(normalized)) {
    return {
      type: "group",
      id: normalized,
      normalized: `#${normalized}`,
    };
  }

  // Default to group (room) targets.
  return {
    type: "group",
    id: normalized,
    normalized,
  };
}

/**
 * Normalize target identifier to proluofire-im format
 *
 * TODO: Implement target normalization based on proluofire-im requirements
 */
export function normalizeTarget(target: string): string {
  if (target === undefined || target === null) return "";
  if (typeof target !== "string") return ""; // Extra safety check
  const trimmed = stripProluofireImPrefix(target);
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("user:")) {
    const id = normalizeProluofireImUserId(trimmed);
    return id ? `@${id}` : "";
  }
  if (lower.startsWith("group:")) {
    const id = normalizeProluofireImGroupId(trimmed);
    return id ? `#${id}` : "";
  }
  if (trimmed.startsWith("@") || trimmed.startsWith("#")) return trimmed;
  if (isNumericId(trimmed)) return `#${trimmed}`;
  return trimmed;
}

/**
 * Validate target identifier
 *
 * TODO: Implement target validation based on proluofire-im rules
 */
export function validateTarget(target: string): { valid: boolean; error?: string } {
  const normalized = normalizeTarget(target);
  if (!normalized) {
    return { valid: false, error: "Target cannot be empty" };
  }
  if (normalized === "@" || normalized === "#") {
    return { valid: false, error: "Target is missing identifier" };
  }
  return { valid: true };
}
