import type { OpenClawConfig } from "openclaw/plugin-sdk";

// Core configuration type extending OpenClaw's config
export interface CoreConfig extends OpenClawConfig {
  channels?: {
    "proluofire-im"?: ProluofireImChannelConfig;
    [key: string]: unknown;
  };
}

// Channel configuration for proluofire-im
export interface ProluofireImChannelConfig {
  enabled?: boolean;
  name?: string;
  serverUrl?: string;
  wsUrl?: string;
  webhookPath?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  botUid?: string | number;
  dm?: {
    policy?: "pairing" | "allowlist" | "open";
    allowFrom?: string[];
  };
  groupPolicy?: "allowlist" | "open" | "disabled";
  groups?: Record<string, ProluofireImGroupConfig>;
  groupAllowFrom?: string[];
  mediaMaxMb?: number;
  accounts?: Record<string, ProluofireImAccountConfig>;
}

// Group configuration
export interface ProluofireImGroupConfig {
  users?: string[];
  requireMention?: boolean;
}

// Account configuration (for multi-account support)
export interface ProluofireImAccountConfig {
  enabled?: boolean;
  name?: string;
  serverUrl?: string;
  wsUrl?: string;
  webhookPath?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  botUid?: string | number;
  dm?: {
    policy?: "pairing" | "allowlist" | "open";
    allowFrom?: string[];
  };
  groupPolicy?: "allowlist" | "open" | "disabled";
  groups?: Record<string, ProluofireImGroupConfig>;
  groupAllowFrom?: string[];
  mediaMaxMb?: number;
}

// Resolved account with all configuration
export interface ResolvedProluofireImAccount {
  accountId: string;
  name: string | null;
  enabled: boolean;
  configured: boolean;
  serverUrl: string;
  wsUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  config: ProluofireImChannelConfig;
}

// Message types
export interface ProluofireImMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  roomId?: string;
  threadId?: string;
  replyToId?: string;
  userId?: string;
  selfUid?: string;
  attachments?: ProluofireImAttachment[];
}

export interface ProluofireImAttachment {
  id: string;
  type: string;
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}

// Client types
export interface ProluofireImClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(target: string, content: string, options?: SendMessageOptions): Promise<string>;
  onMessage(handler: (message: ProluofireImMessage) => void): void;
  onConnectionStatus(handler: (status: ConnectionStatus) => void): void;
}

export interface SendMessageOptions {
  threadId?: string;
  replyToId?: string;
  attachments?: ProluofireImAttachment[];
  localId?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
}

export type ProluofireImClientInternal = ProluofireImClient & {
  _triggerMessage?: (message: ProluofireImMessage) => void;
  _triggerStatus?: (status: ConnectionStatus) => void;
};
