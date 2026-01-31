import type { CoreConfig } from "./types.js";
import { resolveProluofireImAuth } from "./client.js";

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
  apiKey?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  elapsedMs: number;
}> {
  const { serverUrl, apiKey, username, password, timeoutMs = 5000 } = params;
  const startTime = Date.now();

  try {
    console.log(`[proluofire-im] Probing connection to ${serverUrl}...`);

    // TODO: Implement actual probe
    // Options:
    // 1. Try to connect and authenticate
    // 2. Call a health check endpoint (e.g., /health, /ping)
    // 3. Attempt a simple API call (e.g., get user info)
    //
    // Example:
    // const client = await createProluofireImClient({ serverUrl, apiKey, username, password });
    // await Promise.race([
    //   client.connect(),
    //   new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    // ]);
    // await client.disconnect();

    // Stub: simulate probe
    await new Promise((resolve) => setTimeout(resolve, 100));

    const elapsedMs = Date.now() - startTime;

    console.log(`[proluofire-im] Probe successful (${elapsedMs}ms)`);

    return {
      ok: true,
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error(`[proluofire-im] Probe failed (${elapsedMs}ms):`, errorMsg);

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
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  elapsedMs: number;
}> {
  try {
    const auth = await resolveProluofireImAuth({ cfg: params.cfg });
    return await probeProluofireIm({
      serverUrl: auth.serverUrl,
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
