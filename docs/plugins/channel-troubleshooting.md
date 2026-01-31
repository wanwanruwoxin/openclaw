# Channel Integration Troubleshooting Guide

This guide helps you diagnose and fix common issues when integrating a new channel into OpenClaw.

## Table of Contents

1. [Plugin Discovery Issues](#plugin-discovery-issues)
2. [Configuration Problems](#configuration-problems)
3. [Connection Issues](#connection-issues)
4. [Message Sending Failures](#message-sending-failures)
5. [Message Receiving Issues](#message-receiving-issues)
6. [Gateway Problems](#gateway-problems)
7. [Type Errors](#type-errors)
8. [Performance Issues](#performance-issues)

---

## Plugin Discovery Issues

### Problem: Plugin not showing up in channel list

**Symptoms:**
- `openclaw channels status` doesn't show your channel
- Gateway doesn't start your channel
- Plugin not listed in available channels

**Diagnosis:**

```bash
# Check if plugin directory exists
ls -la extensions/your-im/

# Verify package.json structure
cat extensions/your-im/package.json | jq '.openclaw'

# Check for syntax errors
cd extensions/your-im
pnpm build
```

**Solutions:**

1. **Missing openclaw field in package.json**
   ```json
   {
     "openclaw": {
       "extensions": ["./index.ts"],
       "channel": {
         "id": "yourim",
         "label": "YourIM"
       }
     }
   }
   ```

2. **Wrong extension path**
   - Ensure `extensions` points to the correct file
   - Use `./index.ts` not `src/index.ts`

3. **Plugin not exported correctly**
   ```typescript
   // index.ts must export the plugin
   export { yourIMPlugin } from "./plugin.js";
   ```

4. **TypeScript compilation errors**
   ```bash
   # Check for build errors
   pnpm build

   # Fix any type errors before testing
   ```

---

## Configuration Problems

### Problem: "Account not configured" error

**Symptoms:**
- Gateway won't start
- Status shows "not configured"
- Can't send messages

**Diagnosis:**

```bash
# Check config file
cat ~/.clawdbot/config.yaml | grep -A 10 yourim

# Verify config is loaded
openclaw config get channels.yourim
```

**Solutions:**

1. **Missing configuration section**
   ```yaml
   channels:
     yourim:
       accounts:
         default:
           username: "your_username"
           accessToken: "your_token"
           enabled: true
   ```

2. **Wrong account ID**
   ```typescript
   // Make sure your plugin uses the correct default
   config: {
     defaultAccountId: () => "default",
     resolveAccount: (cfg, accountId) => {
       const id = accountId || "default";
       return cfg.channels?.yourim?.accounts?.[id];
     }
   }
   ```

3. **Token not resolved**
   ```typescript
   // Check token resolution logic
   export function resolveYourIMToken(cfg, params) {
     // Try environment variable first
     const envToken = process.env.YOURIM_ACCESS_TOKEN;
     if (envToken) return { token: envToken, source: "env" };

     // Fall back to config
     const account = getAccountConfig(cfg, params.accountId);
     if (account?.accessToken) {
       return { token: account.accessToken, source: "config" };
     }

     return { token: "", source: "none" };
   }
   ```

### Problem: Configuration changes not taking effect

**Symptoms:**
- Changed config but behavior unchanged
- Old values still being used

**Solutions:**

1. **Restart the gateway**
   ```bash
   # Stop gateway
   pkill -f "openclaw gateway"

   # Start again
   openclaw gateway run
   ```

2. **Check for config caching**
   ```typescript
   // Don't cache config in module scope
   // ❌ Bad
   const config = loadConfig();

   // ✅ Good
   function getConfig() {
     return loadConfig();
   }
   ```

---

## Connection Issues

### Problem: Gateway starts but channel doesn't connect

**Symptoms:**
- Gateway running but channel shows "not connected"
- No error messages
- Status shows `running: false`

**Diagnosis:**

```bash
# Check gateway logs
openclaw gateway run --verbose

# Probe the connection
openclaw channels status --probe

# Check for network issues
curl -v https://api.yourim.com/health
```

**Solutions:**

1. **startAccount not called**
   ```typescript
   gateway: {
     startAccount: async (ctx) => {
       // Make sure this is implemented
       ctx.log?.info("Starting connection...");

       ctx.setStatus({
         accountId: ctx.accountId,
         running: true,
         lastStartAt: Date.now(),
       });

       // Start monitor
       await monitorYourIM({ ... });
     }
   }
   ```

2. **Monitor exits immediately**
   ```typescript
   export async function monitorYourIM(params) {
     const { abortSignal } = params;

     // Connect
     await client.connect();

     // ❌ Bad - function exits immediately
     // return;

     // ✅ Good - keep alive until aborted
     await new Promise<void>((resolve) => {
       abortSignal.addEventListener("abort", () => resolve());
     });
   }
   ```

3. **Authentication failure**
   ```typescript
   // Add better error handling
   try {
     await client.connect();
   } catch (error) {
     ctx.log?.error(`Auth failed: ${error.message}`);
     ctx.setStatus({
       accountId: ctx.accountId,
       running: false,
       lastError: error.message,
     });
     throw error;
   }
   ```

### Problem: Connection drops frequently

**Symptoms:**
- Channel connects then disconnects
- Reconnection loops
- "Connection lost" errors

**Solutions:**

1. **Implement reconnection logic**
   ```typescript
   async function connectWithRetry(client, maxRetries = 5) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         await client.connect();
         return;
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(r => setTimeout(r, 1000 * (i + 1)));
       }
     }
   }
   ```

2. **Handle connection errors gracefully**
   ```typescript
   client.on("error", (error) => {
     runtime.error(`Connection error: ${error.message}`);
     // Don't crash, try to reconnect
   });

   client.on("disconnect", async () => {
     if (!abortSignal.aborted) {
       runtime.log("Reconnecting...");
       await connectWithRetry(client);
     }
   });
   ```

---

## Message Sending Failures

### Problem: sendText returns error

**Symptoms:**
- `openclaw message send` fails
- "Failed to send message" error
- Messages not delivered

**Diagnosis:**

```bash
# Test sending with verbose output
openclaw message send --channel yourim --to "test" "Hello" --verbose

# Check if client is connected
openclaw channels status
```

**Solutions:**

1. **Client not initialized**
   ```typescript
   sendText: async (ctx) => {
     const client = getClient(ctx.accountId || "default");

     if (!client) {
       return {
         ok: false,
         error: new Error("Client not connected. Start gateway first."),
       };
     }

     // Send message
   }
   ```

2. **Invalid recipient format**
   ```typescript
   outbound: {
     resolveTarget: (params) => {
       const { to } = params;

       // Validate and normalize target
       if (!to || !to.match(/^[a-zA-Z0-9_]+$/)) {
         return {
           ok: false,
           error: new Error(`Invalid recipient format: ${to}`),
         };
       }

       return { ok: true, to };
     }
   }
   ```

3. **API rate limiting**
   ```typescript
   // Implement rate limiting
   import pLimit from "p-limit";

   const limit = pLimit(5); // Max 5 concurrent requests

   sendText: async (ctx) => {
     return limit(async () => {
       // Send message
     });
   }
   ```

### Problem: Media messages fail

**Symptoms:**
- Text works but media fails
- "Unsupported media type" error

**Solutions:**

1. **Implement sendMedia**
   ```typescript
   sendMedia: async (ctx) => {
     const { mediaUrl, to } = ctx;

     // Download media
     const response = await fetch(mediaUrl);
     const buffer = await response.arrayBuffer();

     // Upload to your IM platform
     const uploadResult = await client.uploadMedia(buffer);

     // Send media message
     await client.sendMessage({
       to,
       mediaId: uploadResult.id,
     });

     return { ok: true };
   }
   ```

---

## Message Receiving Issues

### Problem: Messages not received by OpenClaw

**Symptoms:**
- Can send but not receive
- No inbound messages in logs
- Agent doesn't respond

**Diagnosis:**

```bash
# Check if monitor is running
openclaw gateway run --verbose

# Look for "message received" logs
tail -f ~/.clawdbot/logs/gateway.log | grep message
```

**Solutions:**

1. **handleInboundMessage not called**
   ```typescript
   client.on("message", async (message) => {
     // Build context
     const context = {
       channel: "yourim",
       accountId,
       from: message.senderId,
       to: message.recipientId,
       text: message.content,
       chatType: message.isGroup ? "group" : "dm",
       messageId: message.id,
       timestamp: message.timestamp,
     };

     // ✅ Must call this
     await runtime.handleInboundMessage(context);
   });
   ```

2. **Missing required fields**
   ```typescript
   // Ensure all required fields are present
   const context = {
     channel: "yourim",        // ✅ Required
     accountId: "default",     // ✅ Required
     from: message.senderId,   // ✅ Required
     to: message.recipientId,  // ✅ Required
     text: message.content,    // ✅ Required
     chatType: "dm",           // ✅ Required
     messageId: message.id,    // ✅ Required
     timestamp: Date.now(),    // ✅ Required
   };
   ```

3. **Event listener not registered**
   ```typescript
   export async function monitorYourIM(params) {
     const client = await createClient(params.account);

     // ✅ Register BEFORE connecting
     client.on("message", handleMessage);

     await client.connect();
   }
   ```

---

## Gateway Problems

### Problem: Gateway crashes on startup

**Symptoms:**
- Gateway exits immediately
- Uncaught exception errors
- Process terminates

**Diagnosis:**

```bash
# Run with full error output
openclaw gateway run 2>&1 | tee gateway-error.log

# Check for unhandled rejections
node --trace-warnings openclaw.mjs gateway run
```

**Solutions:**

1. **Async errors not caught**
   ```typescript
   gateway: {
     startAccount: async (ctx) => {
       try {
         await monitorYourIM({ ... });
       } catch (error) {
         ctx.log?.error(`Failed to start: ${error}`);
         ctx.setStatus({
           accountId: ctx.accountId,
           running: false,
           lastError: error.message,
         });
         // Don't rethrow - let gateway continue
       }
     }
   }
   ```

2. **Missing dependencies**
   ```bash
   # Install all dependencies
   cd extensions/your-im
   pnpm install

   # Check for missing peer dependencies
   pnpm list
   ```

### Problem: Gateway won't stop cleanly

**Symptoms:**
- `Ctrl+C` doesn't stop gateway
- Process hangs on shutdown
- Resources not cleaned up

**Solutions:**

1. **Implement proper cleanup**
   ```typescript
   gateway: {
     stopAccount: async (ctx) => {
       const client = getClient(ctx.accountId);

       if (client) {
         // Close all connections
         await client.disconnect();

         // Clear timers
         clearAllTimers();

         // Remove from registry
         removeClient(ctx.accountId);
       }

       ctx.setStatus({
         accountId: ctx.accountId,
         running: false,
         lastStopAt: Date.now(),
       });
     }
   }
   ```

2. **Handle abort signal properly**
   ```typescript
   export async function monitorYourIM(params) {
     const { abortSignal } = params;

     abortSignal.addEventListener("abort", async () => {
       // Clean up immediately
       await client.disconnect();
     });
   }
   ```

---

## Type Errors

### Problem: TypeScript compilation errors

**Symptoms:**
- `pnpm build` fails
- Type mismatch errors
- Import errors

**Solutions:**

1. **Import from correct package**
   ```typescript
   // ✅ Correct
   import type { ChannelPlugin } from "openclaw/plugin-sdk";

   // ❌ Wrong
   import type { ChannelPlugin } from "openclaw";
   ```

2. **Use correct types**
   ```typescript
   // Make sure your account config matches the generic
   export const yourIMPlugin: ChannelPlugin<YourIMAccountConfig> = {
     config: {
       resolveAccount: (cfg, accountId): YourIMAccountConfig => {
         // Return type must match generic
       }
     }
   }
   ```

3. **Handle optional fields**
   ```typescript
   // Use optional chaining and nullish coalescing
   const account = cfg.channels?.yourim?.accounts?.[id];
   const enabled = account?.enabled ?? true;
   ```

---

## Performance Issues

### Problem: High memory usage

**Symptoms:**
- Gateway memory grows over time
- Out of memory errors
- Slow performance

**Solutions:**

1. **Clean up old messages**
   ```typescript
   const messageCache = new Map();
   const MAX_CACHE_SIZE = 1000;

   function cacheMessage(id, message) {
     if (messageCache.size >= MAX_CACHE_SIZE) {
       const firstKey = messageCache.keys().next().value;
       messageCache.delete(firstKey);
     }
     messageCache.set(id, message);
   }
   ```

2. **Avoid memory leaks**
   ```typescript
   // Remove event listeners on cleanup
   function setupListeners(client) {
     const handler = (msg) => handleMessage(msg);
     client.on("message", handler);

     return () => {
       client.off("message", handler);
     };
   }

   // Call cleanup function when stopping
   const cleanup = setupListeners(client);
   abortSignal.addEventListener("abort", cleanup);
   ```

### Problem: Slow message processing

**Solutions:**

1. **Process messages in parallel**
   ```typescript
   client.on("message", async (message) => {
     // Don't await - process in background
     handleMessage(message).catch(error => {
       runtime.error(`Failed to handle message: ${error}`);
     });
   });
   ```

2. **Batch operations**
   ```typescript
   const messageQueue = [];

   setInterval(async () => {
     if (messageQueue.length > 0) {
       const batch = messageQueue.splice(0, 10);
       await processBatch(batch);
     }
   }, 1000);
   ```

---

## Debugging Tips

### Enable verbose logging

```bash
# Run with debug output
DEBUG=* openclaw gateway run

# Or set log level in config
openclaw config set logging.level debug
```

### Use the probe command

```bash
# Test connection without starting gateway
openclaw channels status --probe
```

### Check runtime state

```typescript
// Add debug logging in your plugin
gateway: {
  startAccount: async (ctx) => {
    ctx.log?.info(`Account: ${JSON.stringify(ctx.account)}`);
    ctx.log?.info(`Config: ${JSON.stringify(ctx.cfg.channels?.yourim)}`);

    // Your logic
  }
}
```

### Test in isolation

```typescript
// Create a test script
import { yourIMPlugin } from "./plugin.js";

const mockConfig = {
  channels: {
    yourim: {
      accounts: {
        default: {
          username: "test",
          accessToken: "test_token",
        }
      }
    }
  }
};

const account = yourIMPlugin.config.resolveAccount(mockConfig, "default");
console.log("Resolved account:", account);
```

---

## Getting Help

If you're still stuck:

1. Check existing channel implementations for reference
2. Review the type definitions in `src/channels/plugins/types.*.ts`
3. Search for similar issues in the OpenClaw repository
4. Ask in the OpenClaw community
5. Open a GitHub issue with:
   - Your plugin code
   - Error messages
   - Steps to reproduce
   - Expected vs actual behavior

## Useful Commands

```bash
# Check plugin structure
tree extensions/your-im/

# Validate package.json
cat extensions/your-im/package.json | jq .

# Test configuration
openclaw config get channels.yourim

# Check gateway status
openclaw channels status --all

# View logs
tail -f ~/.clawdbot/logs/gateway.log

# Test message sending
openclaw message send --channel yourim --to "test" "Hello"

# Restart gateway
pkill -f "openclaw gateway" && openclaw gateway run
```
