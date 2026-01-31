# Channel Integration Guide

This guide explains how to integrate your own IM (Instant Messaging) platform into OpenClaw by creating a custom channel plugin.

## Architecture Overview

OpenClaw uses a **plugin-based architecture** to support different messaging channels. Each channel is a plugin that implements the `ChannelPlugin` interface.

### Core Components

- **ChannelPlugin**: Main plugin interface (defined in `src/channels/plugins/types.plugin.ts`)
- **Adapters**: Various adapters for configuration, messaging, status monitoring, gateway, etc.
- **Gateway**: Manages connection lifecycle
- **Outbound**: Handles message sending
- **Inbound**: Handles message receiving and routing

## Integration Approaches

You have two ways to integrate your IM platform:

### Approach 1: Extension Plugin (Recommended)

- **Location**: `extensions/your-im/`
- **Advantages**:
  - Independent development
  - Separate dependencies
  - Can be published to npm independently
- **Best for**: Third-party IM platforms, channels requiring special dependencies

### Approach 2: Core Channel

- **Location**: `src/your-im/`
- **Advantages**: Tighter integration with core code
- **Best for**: Officially supported mainstream IM platforms

**We recommend Approach 1 (Extension Plugin)** for flexibility and minimal impact on core code.

## Implementation Steps

### Step 1: Create Plugin Directory Structure

```
extensions/your-im/
├── package.json          # Plugin configuration
├── src/
│   ├── index.ts         # Export entry point
│   ├── plugin.ts        # Main plugin implementation
│   ├── config.ts        # Configuration management
│   ├── config-schema.ts # Configuration schema
│   ├── outbound.ts      # Message sending
│   ├── monitor.ts       # Message receiving/monitoring
│   ├── token.ts         # Authentication management
│   ├── probe.ts         # Connection probing
│   └── types.ts         # Type definitions
└── README.md
```

### Step 2: Configure package.json

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
      "selectionLabel": "YourIM (Description)",
      "docsPath": "/channels/yourim",
      "blurb": "Your IM platform integration",
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

### Step 3: Implement Core Plugin (plugin.ts)

```typescript
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk";

// Define account configuration type
export type YourIMAccountConfig = {
  username: string;
  accessToken: string;
  apiEndpoint?: string;
  enabled?: boolean;
};

export const yourIMPlugin: ChannelPlugin<YourIMAccountConfig> = {
  // 1. Basic Information
  id: "yourim",

  meta: {
    id: "yourim",
    label: "YourIM",
    selectionLabel: "YourIM",
    docsPath: "/channels/yourim",
    blurb: "YourIM messaging platform integration",
  },

  // 2. Capability Declaration
  capabilities: {
    chatTypes: ["dm", "group"],  // Support DM and group chat
    reactions: true,              // Support reactions
    reply: true,                  // Support replies
    media: true,                  // Support media files
    threads: false,               // No thread support
  },

  // 3. Configuration Management
  config: {
    listAccountIds: (cfg: OpenClawConfig) => {
      const channels = cfg.channels?.yourim?.accounts;
      return channels ? Object.keys(channels) : [];
    },

    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => {
      const id = accountId || "default";
      return cfg.channels?.yourim?.accounts?.[id] || {
        username: "",
        accessToken: "",
        enabled: false,
      };
    },

    defaultAccountId: () => "default",

    isConfigured: (account: YourIMAccountConfig) => {
      return !!(account.username && account.accessToken);
    },

    isEnabled: (account: YourIMAccountConfig) => {
      return account.enabled !== false;
    },
  },

  // 4. Configuration Schema
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
      },
    },
  }),

  // 5. Outbound Adapter (Message Sending)
  outbound: {
    deliveryMode: "direct",  // or "gateway" or "hybrid"

    sendText: async (ctx) => {
      const { cfg, to, text, accountId } = ctx;
      const account = yourIMPlugin.config.resolveAccount(cfg, accountId);

      // Call your IM SDK to send message
      const result = await yourIMSDK.sendMessage({
        token: account.accessToken,
        recipient: to,
        content: text,
      });

      return {
        ok: true,
        messageId: result.messageId,
      };
    },

    sendMedia: async (ctx) => {
      const { cfg, to, mediaUrl, accountId } = ctx;
      // Implementation logic
    },
  },

  // 6. Gateway Adapter (Connection Management)
  gateway: {
    startAccount: async (ctx) => {
      const { account, accountId, cfg, runtime, abortSignal, log } = ctx;

      log?.info(`Starting YourIM connection for ${account.username}`);

      ctx.setStatus({
        accountId,
        running: true,
        lastStartAt: Date.now(),
      });

      // Start message monitoring
      const { monitorYourIM } = await import("./monitor.js");
      await monitorYourIM({
        account,
        accountId,
        config: cfg,
        runtime,
        abortSignal,
      });
    },

    stopAccount: async (ctx) => {
      const { accountId, log } = ctx;

      log?.info(`Stopping YourIM connection`);

      // Cleanup connection
      await cleanupConnection(accountId);

      ctx.setStatus({
        accountId,
        running: false,
        lastStopAt: Date.now(),
      });
    },
  },

  // 7. Status Monitoring
  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastStartAt: null,
      lastStopAt: null,
    },

    probeAccount: async ({ account, timeoutMs }) => {
      return await yourIMSDK.checkConnection(account.accessToken);
    },

    buildAccountSnapshot: ({ account, runtime, probe }) => {
      return {
        accountId: runtime?.accountId || "default",
        enabled: account.enabled !== false,
        configured: !!(account.username && account.accessToken),
        running: runtime?.running || false,
        connected: probe?.connected || false,
        lastStartAt: runtime?.lastStartAt || null,
        probe,
      };
    },
  },

  // 8. Pairing/Authorization (Optional)
  pairing: {
    idLabel: "yourIMUserId",
    normalizeAllowEntry: (entry) => entry.toLowerCase(),
  },
};
```

### Step 4: Implement Message Monitoring (monitor.ts)

```typescript
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { OpenClawConfig } from "openclaw/plugin-sdk";

export async function monitorYourIM(params: {
  account: YourIMAccountConfig;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
}) {
  const { account, accountId, config, runtime, abortSignal } = params;

  // Create IM client
  const client = await yourIMSDK.createClient({
    token: account.accessToken,
  });

  // Listen for messages
  client.on("message", async (message) => {
    // Build message context
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

    // Call OpenClaw's message processing pipeline
    await runtime.handleInboundMessage(context);
  });

  // Listen for abort signal
  abortSignal.addEventListener("abort", () => {
    client.disconnect();
  });

  // Maintain connection
  await client.connect();
}
```

### Step 5: Export Plugin (index.ts)

```typescript
export { yourIMPlugin } from "./plugin.js";
export type { YourIMAccountConfig } from "./plugin.js";
```

## Configuration and Registration

### User Configuration

Users configure your channel in `~/.clawdbot/config.yaml`:

```yaml
channels:
  yourim:
    accounts:
      default:
        username: "your_username"
        accessToken: "your_token"
        enabled: true
```

### Automatic Plugin Discovery

OpenClaw automatically discovers plugins in the `extensions/` directory if:
- `package.json` contains the `openclaw.extensions` field
- The plugin exports an object conforming to the `ChannelPlugin` interface

## Testing

### Local Development Testing

```bash
# Install dependencies
pnpm install

# Run your plugin
pnpm openclaw gateway run

# Test sending a message
pnpm openclaw message send --channel yourim --to "user123" "Hello"
```

### Writing Unit Tests

Create `extensions/your-im/src/plugin.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { yourIMPlugin } from "./plugin.js";

describe("YourIM Plugin", () => {
  it("should have correct id", () => {
    expect(yourIMPlugin.id).toBe("yourim");
  });

  it("should support dm and group chat", () => {
    expect(yourIMPlugin.capabilities.chatTypes).toContain("dm");
    expect(yourIMPlugin.capabilities.chatTypes).toContain("group");
  });
});
```

## Key Interfaces Reference

| Adapter | Required | Description |
|---------|----------|-------------|
| `config` | ✅ | Account configuration management |
| `capabilities` | ✅ | Declare channel capabilities |
| `outbound` | ✅ | Message sending |
| `gateway` | ✅ | Connection lifecycle |
| `status` | Recommended | Status monitoring |
| `pairing` | Optional | User pairing/authorization |
| `security` | Optional | Security policies |
| `directory` | Optional | User/group directory |
| `resolver` | Optional | Target resolution |
| `actions` | Optional | Agent tool integration |

## Best Practices

1. **Error Handling**: Implement comprehensive error handling for all async operations
2. **Logging**: Use `ctx.log` to record critical operations
3. **State Management**: Update connection status promptly
4. **Resource Cleanup**: Clean up all resources in `stopAccount`
5. **Type Safety**: Leverage TypeScript's type system fully
6. **Test Coverage**: Maintain 70%+ test coverage

## Reference Examples

You can reference these existing implementations:

- **Simple Example**: `extensions/twitch/src/plugin.ts`
- **Complex Example**: `extensions/msteams/`
- **Core Channel**: `src/telegram/`

## Adapter Details

### Config Adapter

Manages account configuration:

```typescript
config: {
  listAccountIds: (cfg) => string[];
  resolveAccount: (cfg, accountId?) => AccountConfig;
  defaultAccountId?: (cfg) => string;
  isConfigured?: (account, cfg) => boolean;
  isEnabled?: (account, cfg) => boolean;
  describeAccount?: (account, cfg) => ChannelAccountSnapshot;
}
```

### Outbound Adapter

Handles message delivery:

```typescript
outbound: {
  deliveryMode: "direct" | "gateway" | "hybrid";
  sendText?: (ctx) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx) => Promise<ChannelPollResult>;
  chunker?: (text, limit) => string[];
  textChunkLimit?: number;
}
```

### Gateway Adapter

Manages connection lifecycle:

```typescript
gateway: {
  startAccount?: (ctx) => Promise<void>;
  stopAccount?: (ctx) => Promise<void>;
  loginWithQrStart?: (params) => Promise<ChannelLoginWithQrStartResult>;
  loginWithQrWait?: (params) => Promise<ChannelLoginWithQrWaitResult>;
  logoutAccount?: (ctx) => Promise<ChannelLogoutResult>;
}
```

### Status Adapter

Monitors channel health:

```typescript
status: {
  defaultRuntime?: ChannelAccountSnapshot;
  buildChannelSummary?: (params) => Record<string, unknown>;
  probeAccount?: (params) => Promise<unknown>;
  auditAccount?: (params) => Promise<unknown>;
  buildAccountSnapshot?: (params) => ChannelAccountSnapshot;
  collectStatusIssues?: (accounts) => ChannelStatusIssue[];
}
```

## Common Patterns

### Authentication Token Management

```typescript
// token.ts
export function resolveYourIMToken(
  cfg: OpenClawConfig,
  params: { accountId?: string }
): { token: string; source: string } {
  const account = getAccountConfig(cfg, params.accountId);

  // Check environment variable first
  const envToken = process.env.YOURIM_ACCESS_TOKEN;
  if (envToken) {
    return { token: envToken, source: "env:YOURIM_ACCESS_TOKEN" };
  }

  // Fall back to config
  if (account?.accessToken) {
    return { token: account.accessToken, source: "config" };
  }

  return { token: "", source: "none" };
}
```

### Message Context Building

```typescript
function buildMessageContext(message: YourIMMessage, accountId: string) {
  return {
    channel: "yourim",
    accountId,
    from: message.senderId,
    to: message.recipientId,
    text: message.content,
    chatType: message.isGroup ? "group" : "dm",
    messageId: message.id,
    timestamp: message.timestamp,
    // Optional fields
    replyToId: message.replyTo?.id,
    mediaUrl: message.media?.url,
    senderName: message.sender?.name,
  };
}
```

### Connection State Management

```typescript
class ConnectionManager {
  private client: YourIMClient | null = null;
  private status: ChannelAccountSnapshot;

  async connect(account: YourIMAccountConfig) {
    this.status = {
      ...this.status,
      running: true,
      lastStartAt: Date.now(),
      lastError: null,
    };

    try {
      this.client = await yourIMSDK.createClient({
        token: account.accessToken,
      });

      await this.client.connect();

      this.status.connected = true;
      this.status.lastConnectedAt = Date.now();
    } catch (error) {
      this.status.lastError = error.message;
      this.status.running = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    this.status = {
      ...this.status,
      running: false,
      connected: false,
      lastStopAt: Date.now(),
    };
  }
}
```

## Troubleshooting

### Plugin Not Discovered

Check that:
1. `package.json` has the `openclaw.extensions` field
2. The extension path is correct
3. The plugin exports a valid `ChannelPlugin` object

### Messages Not Received

Verify:
1. The monitor is properly connected
2. `runtime.handleInboundMessage()` is being called
3. Message context has all required fields
4. No errors in gateway logs

### Messages Not Sent

Check:
1. `outbound.sendText` is implemented
2. Account is configured and enabled
3. Target recipient format is correct
4. Authentication token is valid

## Advanced Topics

### Custom Agent Tools

You can provide channel-specific tools for the AI agent:

```typescript
agentTools: [
  {
    name: "yourim_send_sticker",
    description: "Send a sticker in YourIM",
    input: Type.Object({
      to: Type.String(),
      stickerId: Type.String(),
    }),
    execute: async (args) => {
      // Implementation
    },
  },
],
```

### Security Policies

Implement DM policies and allowlists:

```typescript
security: {
  resolveDmPolicy: (ctx) => ({
    policy: ctx.account.dmPolicy || "allowlist",
    allowFrom: ctx.account.allowFrom || [],
    policyPath: "channels.yourim.accounts.default.dmPolicy",
    allowFromPath: "channels.yourim.accounts.default.allowFrom",
    approveHint: "Add user ID to allowFrom list",
  }),
},
```

### Directory Integration

Provide user/group lookup:

```typescript
directory: {
  listPeers: async ({ cfg, accountId, query, limit, runtime }) => {
    const account = getAccountConfig(cfg, accountId);
    const users = await yourIMSDK.searchUsers(account.accessToken, query);

    return users.map(user => ({
      kind: "user",
      id: user.id,
      name: user.displayName,
      handle: user.username,
      avatarUrl: user.avatar,
    }));
  },
},
```

## Next Steps

1. Review existing channel implementations in `extensions/` and `src/`
2. Set up your development environment
3. Implement the basic plugin structure
4. Test with local configuration
5. Add comprehensive error handling and logging
6. Write unit tests
7. Document your channel in `docs/channels/your-im.md`
8. Submit a pull request (if contributing to OpenClaw)

## Getting Help

- Check existing channel implementations for patterns
- Review the type definitions in `src/channels/plugins/types.*.ts`
- Ask questions in the OpenClaw community
- Open an issue on GitHub for bugs or feature requests
