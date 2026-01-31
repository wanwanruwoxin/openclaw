import type { OpenClawConfig } from "openclaw/plugin-sdk";

// Core configuration type extending OpenClaw's config
export interface CoreConfig extends OpenClawConfig {
  channels?: {
    proluofireIm?: ProluofireImChannelConfig;
    [key: string]: unknown;
  };
}

// Channel configuration for proluofire-im
export interface ProluofireImChannelConfig {
  enabled?: boolean;
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  dm?: {
    policy?: "pairing" | "allowlist" | "open";
    allowFrom?: string[];
  };
  groupPolicy?: "allowlist" | "open";
  groups?: Record<string, ProluofireImGroupConfig>;
  groupAllowFrom?: string[];
  mediaMaxMb?: number;
  accounts?: Record<string, ProluofireImAccountConfig>;
}

// Group configuration
export interface ProluofireImGroupConfig {
  users?: string[];
}

// Account configuration (for multi-account support)
export interface ProluofireImAccountConfig {
  enabled?: boolean;
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  dm?: {
    policy?: "pairing" | "allowlist" | "open";
    allowFrom?: string[];
  };
  groupPolicy?: "allowlist" | "open";
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
  threadId?: string;
  replyToId?: string;
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
  sendMessage(target: string, content: string, options?: SendMessageOptions): Promise<void>;
  onMessage(handler: (message: ProluofireImMessage) => void): void;
  onConnectionStatus(handler: (status: ConnectionStatus) => void): void;
}

export interface SendMessageOptions {
  threadId?: string;
  replyToId?: string;
  attachments?: ProluofireImAttachment[];
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
}
