import type { PluginRuntime } from "openclaw/plugin-sdk";

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
