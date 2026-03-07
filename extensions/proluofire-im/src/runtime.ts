import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { ProluofireImClient } from "./types.js";

let runtime: PluginRuntime | null = null;

/**
 * Set the OpenClaw runtime instance
 */
export function setProluofireImRuntime(rt: PluginRuntime): void {
  runtime = rt;
}

/**
 * Get the OpenClaw runtime instance
 */
export function getProluofireImRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Proluofire IM runtime not initialized");
  }
  return runtime;
}

/**
 * Runtime state for proluofire-im accounts
 */
export interface ProluofireImRuntimeState {
  accountId: string;
  running: boolean;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastProbeAt: number | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

const runtimeStates = new Map<string, ProluofireImRuntimeState>();
const clientRegistry = new Map<string, ProluofireImClient>();
const directRoomRegistry = new Map<string, Map<string, string>>();

function normalizeNumericId(value: string): string {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function normalizeUserIdFromTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return "";
  const withoutChannel = trimmed.replace(/^proluofire-im:/i, "");
  const lower = withoutChannel.toLowerCase();
  const withoutPrefix = lower.startsWith("user:") ? withoutChannel.slice(5) : withoutChannel;
  const withoutSymbol =
    withoutPrefix.startsWith("@") || withoutPrefix.startsWith("#")
      ? withoutPrefix.slice(1)
      : withoutPrefix;
  return normalizeNumericId(withoutSymbol);
}

/**
 * Bind a direct-chat sender user ID to the current room ID.
 */
export function bindDirectRoomForUser(params: {
  accountId: string;
  userId: string;
  roomId: string;
}): void {
  const accountId = params.accountId.trim();
  const userId = normalizeNumericId(params.userId);
  const roomId = normalizeNumericId(params.roomId);
  if (!accountId || !userId || !roomId) return;
  const byUser = directRoomRegistry.get(accountId) ?? new Map<string, string>();
  byUser.set(userId, roomId);
  directRoomRegistry.set(accountId, byUser);
}

/**
 * Resolve the room ID for a direct user target.
 */
export function resolveDirectRoomForTarget(params: {
  accountId: string;
  target: string;
}): string | null {
  const accountId = params.accountId.trim();
  if (!accountId) return null;
  const userId = normalizeUserIdFromTarget(params.target);
  if (!userId) return null;
  const byUser = directRoomRegistry.get(accountId);
  return byUser?.get(userId) ?? null;
}

/**
 * Get runtime state for an account
 */
export function getRuntimeState(accountId: string): ProluofireImRuntimeState {
  let state = runtimeStates.get(accountId);
  if (!state) {
    state = {
      accountId,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      lastProbeAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    };
    runtimeStates.set(accountId, state);
  }
  return state;
}

/**
 * Update runtime state for an account
 */
export function updateRuntimeState(
  accountId: string,
  updates: Partial<ProluofireImRuntimeState>,
): void {
  const state = getRuntimeState(accountId);
  Object.assign(state, updates);
}

/**
 * Mark account as started
 */
export function markAccountStarted(accountId: string): void {
  updateRuntimeState(accountId, {
    running: true,
    lastStartAt: Date.now(),
    lastError: null,
  });
}

/**
 * Mark account as stopped
 */
export function markAccountStopped(accountId: string, error?: string): void {
  updateRuntimeState(accountId, {
    running: false,
    lastStopAt: Date.now(),
    lastError: error ?? null,
  });
}

/**
 * Mark inbound message received
 */
export function markInboundMessage(accountId: string): void {
  updateRuntimeState(accountId, {
    lastInboundAt: Date.now(),
  });
}

/**
 * Mark outbound message sent
 */
export function markOutboundMessage(accountId: string): void {
  updateRuntimeState(accountId, {
    lastOutboundAt: Date.now(),
  });
}

/**
 * Register a connected client for an account.
 */
export function registerClientForAccount(accountId: string, client: ProluofireImClient): void {
  clientRegistry.set(accountId, client);
}

/**
 * Remove a client registration for an account.
 */
export function unregisterClientForAccount(accountId: string, client?: ProluofireImClient): void {
  const existing = clientRegistry.get(accountId);
  if (existing && (!client || existing === client)) {
    clientRegistry.delete(accountId);
  }
}

/**
 * Return a registered client for an account if available.
 */
export function getClientForAccount(accountId: string): ProluofireImClient | null {
  return clientRegistry.get(accountId) ?? null;
}
