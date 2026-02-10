import type { CoreConfig } from "./types.js";
import { createProluofireImClient, resolveProluofireImAuth } from "./client.js";

/**
 * Probe proluofire-im connection health
 *
 * TODO: Implement actual health check using proluofire-im API
 * - Attempt to connect to server
 * - Verify authentication
 * - Check API availability
 * - Return success/failure with timing
 */
export async function probeProluofireIm(params: {
  serverUrl: string;
  wsUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  elapsedMs: number;
}> {
  const { serverUrl, wsUrl, apiKey, username, password, timeoutMs = 5000 } = params;
  const startTime = Date.now();

  try {
    // Avoid connecting to WS during probe as it conflicts with the main connection
    // (Server kicks older connection if same token is used)
    // Instead, we just check if the server is reachable via HTTP
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(serverUrl, {
        method: "HEAD",
        signal: controller.signal,
      }).catch(() => {
        // Fallback to GET if HEAD fails, or ignore error if it's just a protocol error
        // We mainly want to check network reachability
        return fetch(serverUrl, {
          method: "GET",
          signal: controller.signal,
        });
      });
    } catch (err) {
      // If it's a network error (ECONNREFUSED etc), rethrow
      // If it's 404/401/500, it means server is reachable, so we consider it a success for probe
      const msg = String(err);
      if (msg.includes("ECONN") || msg.includes("ETIMEDOUT") || msg.includes("Timeout")) {
        throw err;
      }
    } finally {
      clearTimeout(id);
    }

    const elapsedMs = Date.now() - startTime;

    return {
      ok: true,
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      error: errorMsg,
      elapsedMs,
    };
  }
}

/**
 * Probe proluofire-im using config
 */
export async function probeProluofireImFromConfig(params: {
  cfg: CoreConfig;
  accountId?: string;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  elapsedMs: number;
}> {
  try {
    const auth = await resolveProluofireImAuth({
      cfg: params.cfg,
      accountId: params.accountId,
    });
    return await probeProluofireIm({
      serverUrl: auth.serverUrl,
      wsUrl: auth.wsUrl,
      apiKey: auth.apiKey,
      username: auth.username,
      password: auth.password,
      timeoutMs: params.timeoutMs,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: 0,
    };
  }
}
