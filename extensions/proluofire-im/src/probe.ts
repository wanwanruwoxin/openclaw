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
    const client = await createProluofireImClient({ serverUrl, wsUrl, apiKey, username, password });
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
    ]);
    await client.disconnect();

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
