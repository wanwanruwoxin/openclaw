# Channel Integration Quick Reference

A quick reference guide for OpenClaw channel plugin development. For detailed explanations, see [Channel Integration Guide](./channel-integration.md).

## Essential Interfaces

### ChannelPlugin Structure

```typescript
type ChannelPlugin<AccountConfig> = {
  id: string;                              // Unique channel ID
  meta: ChannelMeta;                       // Display metadata
  capabilities: ChannelCapabilities;       // Feature support
  config: ChannelConfigAdapter;            // ✅ Required
  outbound: ChannelOutboundAdapter;        // ✅ Required
  gateway: ChannelGatewayAdapter;          // ✅ Required
  status?: ChannelStatusAdapter;           // Recommended
  configSchema?: ChannelConfigSchema;      // Recommended
  pairing?: ChannelPairingAdapter;         // Optional
  security?: ChannelSecurityAdapter;       // Optional
  directory?: ChannelDirectoryAdapter;     // Optional
  resolver?: ChannelResolverAdapter;       // Optional
  actions?: ChannelMessageActionAdapter;   // Optional
  heartbeat?: ChannelHeartbeatAdapter;     // Optional
  onboarding?: ChannelOnboardingAdapter;   // Optional
}
```

## Required Adapters

### 1. Config Adapter

```typescript
config: {
  listAccountIds: (cfg: OpenClawConfig) => string[];
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => AccountConfig;
  defaultAccountId?: (cfg: OpenClawConfig) => string;
  isConfigured?: (account: AccountConfig, cfg: OpenClawConfig) => boolean;
  isEnabled?: (account: AccountConfig, cfg: OpenClawConfig) => boolean;
}
```

**Minimal Implementation:**
```typescript
config: {
  listAccountIds: (cfg) => Object.keys(cfg.channels?.yourim?.accounts || {}),
  resolveAccount: (cfg, id) => cfg.channels?.yourim?.accounts?.[id || "default"],
  defaultAccountId: () => "default",
  isConfigured: (account) => !!(account?.username && account?.accessToken),
  isEnabled: (account) => account?.enabled !== false,
}
```

### 2. Outbound Adapter

```typescript
outbound: {
  deliveryMode: "direct" | "gateway" | "hybrid";
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
}
```

**Minimal Implementation:**
```typescript
outbound: {
  deliveryMode: "direct",
  sendText: async (ctx) => {
    const { to, text, accountId } = ctx;
    const account = getAccountConfig(ctx.cfg, accountId);

    try {
      const result = await yourIMSDK.send({ to, text, token: account.accessToken });
      return { ok: true, messageId: result.id };
    } catch (error) {
      return { ok: false, error };
    }
  }
}
```

### 3. Gateway Adapter

```typescript
gateway: {
  startAccount?: (ctx: ChannelGatewayContext) => Promise<void>;
  stopAccount?: (ctx: ChannelGatewayContext) => Promise<void>;
}
```

**Minimal Implementation:**
```typescript
gateway: {
  startAccount: async (ctx) => {
    ctx.setStatus({ accountId: ctx.accountId, running: true, lastStartAt: Date.now() });

    const { monitorYourIM } = await import("./monitor.js");
    await monitorYourIM({
      account: ctx.account,
      accountId: ctx.accountId,
      config: ctx.cfg,
      runtime: ctx.runtime,
      abortSignal: ctx.abortSignal,
    });
  },

  stopAccount: async (ctx) => {
    await cleanupConnection(ctx.accountId);
    ctx.setStatus({ accountId: ctx.accountId, running: false, lastStopAt: Date.now() });
  }
}
```

## Capabilities Declaration

```typescript
capabilities: {
  chatTypes: Array<"dm" | "group" | "thread">;  // ✅ Required
  polls?: boolean;           // Can send polls
  reactions?: boolean;       // Can react to messages
  edit?: boolean;           // Can edit sent messages
  unsend?: boolean;         // Can delete sent messages
  reply?: boolean;          // Can reply to messages
  effects?: boolean;        // Supports message effects
  groupManagement?: boolean; // Can manage groups
  threads?: boolean;        // Supports threaded conversations
  media?: boolean;          // Can send media files
  nativeCommands?: boolean; // Has native command support
  blockStreaming?: boolean; // Block streaming responses
}
```

**Common Patterns:**
```typescript
// Simple text-only DM
capabilities: { chatTypes: ["dm"] }

// Full-featured group chat
capabilities: {
  chatTypes: ["dm", "group"],
  reactions: true,
  reply: true,
  media: true,
  threads: true,
}

// Read-only channel
capabilities: {
  chatTypes: ["group"],
  nativeCommands: true,
}
```

## Message Context

### Inbound Message Context

```typescript
const context = {
  channel: "yourim",              // ✅ Required: Your channel ID
  accountId: "default",           // ✅ Required: Account identifier
  from: "user123",                // ✅ Required: Sender ID
  to: "bot456",                   // ✅ Required: Recipient ID
  text: "Hello",                  // ✅ Required: Message text
  chatType: "dm",                 // ✅ Required: "dm" | "group"
  messageId: "msg_123",           // ✅ Required: Unique message ID
  timestamp: Date.now(),          // ✅ Required: Unix timestamp

  // Optional fields
  replyToId?: "msg_122",          // ID of message being replied to
  threadId?: "thread_1",          // Thread identifier
  mediaUrl?: "https://...",       // Media attachment URL
  senderName?: "John Doe",        // Display name
  groupId?: "group_789",          // Group identifier
};

await runtime.handleInboundMessage(context);
```

### Outbound Message Context

```typescript
type ChannelOutboundContext = {
  cfg: OpenClawConfig;            // Full configuration
  to: string;                     // Recipient ID
  text: string;                   // Message text
  mediaUrl?: string;              // Media URL (if sendMedia)
  replyToId?: string | null;      // Reply-to message ID
  threadId?: string | number | null; // Thread ID
  accountId?: string | null;      // Account to send from
  deps?: OutboundSendDeps;        // Additional dependencies
};
```

## Monitor Implementation Pattern

```typescript
export async function monitorYourIM(params: {
  account: YourIMAccountConfig;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { account, accountId, runtime, abortSignal } = params;

  // 1. Create client
  const client = await createClient(account);

  // 2. Register message handler
  client.on("message", async (msg) => {
    await runtime.handleInboundMessage({
      channel: "yourim",
      accountId,
      from: msg.senderId,
      to: msg.recipientId,
      text: msg.content,
      chatType: msg.isGroup ? "group" : "dm",
      messageId: msg.id,
      timestamp: msg.timestamp,
    });
  });

  // 3. Handle abort
  abortSignal.addEventListener("abort", () => {
    client.disconnect();
  });

  // 4. Connect and keep alive
  await client.connect();

  await new Promise<void>((resolve) => {
    abortSignal.addEventListener("abort", () => resolve());
  });
}
```

## Common Patterns

### Token Resolution

```typescript
export function resolveToken(cfg: OpenClawConfig, params: { accountId?: string }) {
  // 1. Try environment variable
  const envToken = process.env.YOURIM_TOKEN;
  if (envToken) return { token: envToken, source: "env:YOURIM_TOKEN" };

  // 2. Try config
  const account = getAccountConfig(cfg, params.accountId);
  if (account?.accessToken) {
    return { token: account.accessToken, source: "config" };
  }

  // 3. No token found
  return { token: "", source: "none" };
}
```

### Client Registry

```typescript
const clients = new Map<string, YourIMClient>();

export function registerClient(accountId: string, client: YourIMClient) {
  clients.set(accountId, client);
}

export function getClient(accountId: string): YourIMClient | undefined {
  return clients.get(accountId);
}

export async function removeClient(accountId: string): Promise<void> {
  const client = clients.get(accountId);
  if (client) {
    await client.disconnect();
    clients.delete(accountId);
  }
}
```

### Error Handling

```typescript
// In gateway.startAccount
try {
  await monitorYourIM({ ... });
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  ctx.log?.error(`Failed to start: ${errorMsg}`);
  ctx.setStatus({
    accountId: ctx.accountId,
    running: false,
    lastError: errorMsg,
  });
  throw error; // Re-throw to signal failure
}

// In outbound.sendText
try {
  const result = await client.sendMessage({ to, text });
  return { ok: true, messageId: result.id };
} catch (error) {
  return {
    ok: false,
    error: error instanceof Error ? error : new Error(String(error)),
  };
}
```

## Status Adapter Pattern

```typescript
status: {
  defaultRuntime: {
    accountId: "default",
    running: false,
    lastStartAt: null,
    lastStopAt: null,
  },

  probeAccount: async ({ account, timeoutMs }) => {
    // Test connection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await yourIMSDK.ping(account.accessToken, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return { connected: true, ...result };
    } catch (error) {
      clearTimeout(timeout);
      return { connected: false, error: error.message };
    }
  },

  buildAccountSnapshot: ({ account, runtime, probe }) => ({
    accountId: runtime?.accountId || "default",
    enabled: account?.enabled !== false,
    configured: !!(account?.username && account?.accessToken),
    running: runtime?.running ?? false,
    connected: probe?.connected ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    probe,
  }),
}
```

## Package.json Template

```json
{
  "name": "@openclaw/your-im",
  "version": "2026.1.29",
  "type": "module",
  "description": "OpenClaw YourIM channel plugin",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "yourim",
      "label": "YourIM",
      "selectionLabel": "YourIM",
      "docsPath": "/channels/yourim",
      "blurb": "YourIM integration",
      "order": 100
    },
    "install": {
      "npmSpec": "@openclaw/your-im",
      "localPath": "extensions/your-im",
      "defaultChoice": "local"
    }
  },
  "dependencies": {
    "your-im-sdk": "^1.0.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

## Configuration Schema

```typescript
import { buildChannelConfigSchema } from "openclaw/plugin-sdk";

configSchema: buildChannelConfigSchema({
  accounts: {
    type: "object",
    additionalProperties: {
      type: "object",
      properties: {
        username: { type: "string" },
        accessToken: { type: "string" },
        apiEndpoint: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["username", "accessToken"],
    },
  },
}),
```

## User Configuration Format

```yaml
# ~/.clawdbot/config.yaml
channels:
  yourim:
    accounts:
      default:
        username: "your_username"
        accessToken: "your_token"
        apiEndpoint: "https://api.yourim.com"
        enabled: true
```

## Testing Commands

```bash
# Install dependencies
pnpm install

# Build plugin
pnpm build

# Start gateway
pnpm openclaw gateway run

# Check status
pnpm openclaw channels status

# Probe connection
pnpm openclaw channels status --probe

# Send test message
pnpm openclaw message send --channel yourim --to "user123" "Hello"

# View logs
tail -f ~/.clawdbot/logs/gateway.log
```

## File Structure Checklist

```
extensions/your-im/
├── package.json          ✅ Required
├── src/
│   ├── index.ts         ✅ Required - Export plugin
│   ├── plugin.ts        ✅ Required - Main plugin
│   ├── types.ts         ✅ Required - Type definitions
│   ├── config.ts        ✅ Required - Config helpers
│   ├── outbound.ts      ✅ Required - Message sending
│   ├── monitor.ts       ✅ Required - Message receiving
│   ├── client.ts        ⚠️  Recommended - Client management
│   ├── token.ts         ⚠️  Recommended - Token resolution
│   ├── probe.ts         ⚠️  Recommended - Connection testing
│   └── config-schema.ts ⚠️  Optional - Schema definition
└── README.md            ⚠️  Recommended
```

## Import Paths

```typescript
// ✅ Correct imports
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk";

// ❌ Wrong imports
import type { ChannelPlugin } from "openclaw";
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";
```

## Common Gotchas

1. **Monitor must stay alive**
   ```typescript
   // ❌ Bad - exits immediately
   async function monitor() {
     await client.connect();
     return; // Function exits!
   }

   // ✅ Good - waits for abort
   async function monitor({ abortSignal }) {
     await client.connect();
     await new Promise(resolve => {
       abortSignal.addEventListener("abort", resolve);
     });
   }
   ```

2. **Handle abort signal**
   ```typescript
   // ✅ Always disconnect on abort
   abortSignal.addEventListener("abort", () => {
     client.disconnect();
   });
   ```

3. **Set status correctly**
   ```typescript
   // ✅ Update status at key points
   ctx.setStatus({ running: true, lastStartAt: Date.now() });
   // ... do work ...
   ctx.setStatus({ running: false, lastStopAt: Date.now() });
   ```

4. **Return proper result format**
   ```typescript
   // ✅ Correct
   return { ok: true, messageId: "123" };
   return { ok: false, error: new Error("Failed") };

   // ❌ Wrong
   return true;
   throw new Error("Failed");
   ```

## Debugging Checklist

- [ ] Plugin appears in `openclaw channels status`
- [ ] Configuration loads correctly
- [ ] Gateway starts without errors
- [ ] Monitor stays running (doesn't exit)
- [ ] Can send messages
- [ ] Can receive messages
- [ ] Status shows correct state
- [ ] Probe works
- [ ] Graceful shutdown works
- [ ] No memory leaks

## Next Steps

1. Copy template files from [Channel Integration Template](./channel-integration-template.md)
2. Replace placeholders with your IM platform details
3. Implement your IM SDK integration
4. Test locally with `openclaw gateway run`
5. Add tests
6. Document in `docs/channels/your-im.md`

## Resources

- [Full Integration Guide](./channel-integration.md)
- [Code Templates](./channel-integration-template.md)
- [Troubleshooting Guide](./channel-troubleshooting.md)
- [Type Definitions](../../src/channels/plugins/types.plugin.ts)
- [Example: Twitch Plugin](../../extensions/twitch/src/plugin.ts)
- [Example: MS Teams Plugin](../../extensions/msteams/)
