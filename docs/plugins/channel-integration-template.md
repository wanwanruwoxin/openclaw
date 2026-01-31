# Channel Integration Quick Start Template

This is a ready-to-use template for creating a new channel plugin. Copy this structure and replace placeholders with your IM platform details.

## Directory Structure

```bash
# Create your plugin directory
mkdir -p extensions/your-im/src
cd extensions/your-im
```

## File Templates

### 1. package.json

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
      "blurb": "YourIM messaging integration",
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

### 2. src/types.ts

```typescript
import type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelMeta,
  ChannelPlugin,
} from "openclaw/plugin-sdk";

export type YourIMAccountConfig = {
  username: string;
  accessToken: string;
  apiEndpoint?: string;
  enabled?: boolean;
};

export type YourIMMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: number;
  isGroup: boolean;
  replyTo?: {
    id: string;
  };
  media?: {
    url: string;
    type: string;
  };
};

export type YourIMClient = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (params: {
    to: string;
    text: string;
  }) => Promise<{ messageId: string }>;
  on: (event: string, handler: (message: YourIMMessage) => void) => void;
};

export {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelMeta,
  ChannelPlugin,
};
```

### 3. src/config.ts

```typescript
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { YourIMAccountConfig } from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";

export function getAccountConfig(
  cfg: OpenClawConfig,
  accountId?: string | null,
): YourIMAccountConfig | undefined {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const channels = cfg.channels as Record<string, any> | undefined;
  const yourimConfig = channels?.yourim as Record<string, any> | undefined;
  const accounts = yourimConfig?.accounts as Record<string, any> | undefined;
  return accounts?.[id] as YourIMAccountConfig | undefined;
}

export function listAccountIds(cfg: OpenClawConfig): string[] {
  const channels = cfg.channels as Record<string, any> | undefined;
  const yourimConfig = channels?.yourim as Record<string, any> | undefined;
  const accounts = yourimConfig?.accounts as Record<string, any> | undefined;
  return accounts ? Object.keys(accounts) : [];
}

export function isAccountConfigured(
  account: YourIMAccountConfig | undefined,
  token?: string,
): boolean {
  if (!account) return false;
  const hasToken = !!(token || account.accessToken);
  return !!(account.username && hasToken);
}
```

### 4. src/token.ts

```typescript
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { getAccountConfig } from "./config.js";

export function resolveYourIMToken(
  cfg: OpenClawConfig,
  params: { accountId?: string },
): { token: string; source: string } {
  const account = getAccountConfig(cfg, params.accountId);

  // Check environment variable first
  const envToken = process.env.YOURIM_ACCESS_TOKEN;
  if (envToken) {
    return { token: envToken, source: "env:YOURIM_ACCESS_TOKEN" };
  }

  // Fall back to config
  if (account?.accessToken) {
    return {
      token: account.accessToken,
      source: `config:channels.yourim.accounts.${params.accountId || "default"}.accessToken`,
    };
  }

  return { token: "", source: "none" };
}
```

### 5. src/client.ts

```typescript
import type { YourIMAccountConfig, YourIMClient } from "./types.js";

// Registry to manage client instances per account
const clientRegistry = new Map<string, YourIMClient>();

export async function createClient(
  account: YourIMAccountConfig,
): Promise<YourIMClient> {
  // TODO: Replace with your actual IM SDK initialization
  const client: YourIMClient = {
    connect: async () => {
      console.log(`Connecting to YourIM as ${account.username}`);
      // Your connection logic here
    },
    disconnect: async () => {
      console.log(`Disconnecting from YourIM`);
      // Your disconnection logic here
    },
    sendMessage: async ({ to, text }) => {
      console.log(`Sending message to ${to}: ${text}`);
      // Your send message logic here
      return { messageId: `msg_${Date.now()}` };
    },
    on: (event, handler) => {
      console.log(`Registered handler for event: ${event}`);
      // Your event listener registration here
    },
  };

  return client;
}

export function registerClient(accountId: string, client: YourIMClient): void {
  clientRegistry.set(accountId, client);
}

export function getClient(accountId: string): YourIMClient | undefined {
  return clientRegistry.get(accountId);
}

export async function removeClient(accountId: string): Promise<void> {
  const client = clientRegistry.get(accountId);
  if (client) {
    await client.disconnect();
    clientRegistry.delete(accountId);
  }
}
```

### 6. src/monitor.ts

```typescript
import type { RuntimeEnv, OpenClawConfig } from "openclaw/plugin-sdk";
import type { YourIMAccountConfig } from "./types.js";
import { createClient, registerClient } from "./client.js";

export async function monitorYourIM(params: {
  account: YourIMAccountConfig;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { account, accountId, config, runtime, abortSignal } = params;

  // Create and register client
  const client = await createClient(account);
  registerClient(accountId, client);

  // Set up message listener
  client.on("message", async (message) => {
    try {
      // Build message context for OpenClaw
      const context = {
        channel: "yourim",
        accountId,
        from: message.senderId,
        to: message.recipientId,
        text: message.content,
        chatType: message.isGroup ? "group" : "dm",
        messageId: message.id,
        timestamp: message.timestamp,
        replyToId: message.replyTo?.id,
        mediaUrl: message.media?.url,
      };

      // Send to OpenClaw's message processing pipeline
      await runtime.handleInboundMessage(context);
    } catch (error) {
      runtime.error(`Error handling message: ${error}`);
    }
  });

  // Handle abort signal
  abortSignal.addEventListener("abort", () => {
    runtime.log("Abort signal received, disconnecting...");
    client.disconnect();
  });

  // Connect and maintain connection
  try {
    await client.connect();
    runtime.log(`YourIM monitor started for ${account.username}`);

    // Keep the monitor alive until aborted
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener("abort", () => resolve());
    });
  } catch (error) {
    runtime.error(`Monitor error: ${error}`);
    throw error;
  }
}
```

### 7. src/outbound.ts

```typescript
import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import { getAccountConfig } from "./config.js";
import { getClient } from "./client.js";

export const yourIMOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",

  sendText: async (ctx) => {
    const { cfg, to, text, accountId } = ctx;
    const account = getAccountConfig(cfg, accountId);

    if (!account) {
      return {
        ok: false,
        error: new Error("Account not configured"),
      };
    }

    try {
      const client = getClient(accountId || "default");
      if (!client) {
        return {
          ok: false,
          error: new Error("Client not connected"),
        };
      }

      const result = await client.sendMessage({ to, text });

      return {
        ok: true,
        messageId: result.messageId,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  sendMedia: async (ctx) => {
    // TODO: Implement media sending
    return {
      ok: false,
      error: new Error("Media sending not implemented yet"),
    };
  },
};
```

### 8. src/probe.ts

```typescript
import type { YourIMAccountConfig } from "./types.js";

export async function probeYourIM(
  account: YourIMAccountConfig,
  timeoutMs: number,
): Promise<{ connected: boolean; error?: string }> {
  try {
    // TODO: Implement actual connection probe
    // This should check if the account credentials are valid
    // and the service is reachable

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Example: Make a simple API call to verify connection
      // const response = await fetch(`${account.apiEndpoint}/health`, {
      //   signal: controller.signal,
      // });

      clearTimeout(timeout);

      return { connected: true };
    } catch (error) {
      clearTimeout(timeout);
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### 9. src/plugin.ts

```typescript
import type { ChannelPlugin } from "openclaw/plugin-sdk";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import type { YourIMAccountConfig } from "./types.js";
import {
  DEFAULT_ACCOUNT_ID,
  getAccountConfig,
  listAccountIds,
  isAccountConfigured,
} from "./config.js";
import { resolveYourIMToken } from "./token.js";
import { yourIMOutbound } from "./outbound.js";
import { probeYourIM } from "./probe.js";
import { removeClient } from "./client.js";

export const yourIMPlugin: ChannelPlugin<YourIMAccountConfig> = {
  id: "yourim",

  meta: {
    id: "yourim",
    label: "YourIM",
    selectionLabel: "YourIM",
    docsPath: "/channels/yourim",
    blurb: "YourIM messaging platform integration",
  },

  capabilities: {
    chatTypes: ["dm", "group"],
    reactions: false,
    reply: true,
    media: false,
    threads: false,
  },

  config: {
    listAccountIds,
    resolveAccount: getAccountConfig,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account, cfg) => {
      const tokenResolution = resolveYourIMToken(cfg, {
        accountId: DEFAULT_ACCOUNT_ID,
      });
      return isAccountConfigured(account, tokenResolution.token);
    },
    isEnabled: (account) => account?.enabled !== false,
  },

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

  outbound: yourIMOutbound,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
    },

    probeAccount: async ({ account, timeoutMs }) => {
      return await probeYourIM(account, timeoutMs);
    },

    buildAccountSnapshot: ({ account, cfg, runtime, probe }) => {
      const tokenResolution = resolveYourIMToken(cfg, {
        accountId: DEFAULT_ACCOUNT_ID,
      });

      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: isAccountConfigured(account, tokenResolution.token),
        running: runtime?.running ?? false,
        connected: probe?.connected ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        probe,
      };
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      const { account, accountId, log } = ctx;

      log?.info(`Starting YourIM connection for ${account.username}`);

      ctx.setStatus({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      try {
        const { monitorYourIM } = await import("./monitor.js");
        await monitorYourIM({
          account,
          accountId,
          config: ctx.cfg,
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
        });
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        log?.error(`Failed to start YourIM: ${errorMsg}`);

        ctx.setStatus({
          accountId,
          running: false,
          lastError: errorMsg,
        });

        throw error;
      }
    },

    stopAccount: async (ctx) => {
      const { accountId, log } = ctx;

      log?.info("Stopping YourIM connection");

      await removeClient(accountId);

      ctx.setStatus({
        accountId,
        running: false,
        lastStopAt: Date.now(),
      });
    },
  },

  pairing: {
    idLabel: "yourIMUserId",
    normalizeAllowEntry: (entry) => entry.toLowerCase().trim(),
  },
};
```

### 10. src/index.ts

```typescript
export { yourIMPlugin } from "./plugin.js";
export type { YourIMAccountConfig } from "./types.js";
```

### 11. README.md

```markdown
# YourIM Channel Plugin for OpenClaw

This plugin integrates YourIM messaging platform with OpenClaw.

## Installation

### From workspace (development)

```bash
cd /path/to/openclaw
pnpm install
```

### From npm (when published)

```bash
openclaw plugin install @openclaw/your-im
```

## Configuration

Add to your `~/.clawdbot/config.yaml`:

```yaml
channels:
  yourim:
    accounts:
      default:
        username: "your_username"
        accessToken: "your_access_token"
        apiEndpoint: "https://api.yourim.com"  # optional
        enabled: true
```

## Environment Variables

You can also configure via environment variables:

```bash
export YOURIM_ACCESS_TOKEN="your_token"
```

## Usage

### Start the gateway

```bash
openclaw gateway run
```

### Send a message

```bash
openclaw message send --channel yourim --to "user123" "Hello from OpenClaw!"
```

### Check status

```bash
openclaw channels status
```

## Development

### Run tests

```bash
pnpm test extensions/your-im
```

### Build

```bash
pnpm build
```

## Features

- ✅ Direct messages
- ✅ Group chats
- ✅ Text messages
- ⏳ Media messages (coming soon)
- ⏳ Reactions (coming soon)

## License

Same as OpenClaw
```

## Quick Setup Script

Create `setup.sh` in your plugin directory:

```bash
#!/bin/bash

# Quick setup script for YourIM channel plugin

PLUGIN_NAME="your-im"
PLUGIN_ID="yourim"
PLUGIN_LABEL="YourIM"

echo "Setting up $PLUGIN_LABEL channel plugin..."

# Create directory structure
mkdir -p "extensions/$PLUGIN_NAME/src"
cd "extensions/$PLUGIN_NAME"

# Create package.json
cat > package.json <<EOF
{
  "name": "@openclaw/$PLUGIN_NAME",
  "version": "2026.1.29",
  "type": "module",
  "description": "OpenClaw $PLUGIN_LABEL channel plugin",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "$PLUGIN_ID",
      "label": "$PLUGIN_LABEL",
      "selectionLabel": "$PLUGIN_LABEL",
      "docsPath": "/channels/$PLUGIN_ID",
      "blurb": "$PLUGIN_LABEL messaging integration",
      "order": 100
    }
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
EOF

echo "✅ Plugin structure created!"
echo "📝 Next steps:"
echo "   1. Edit package.json to add your IM SDK dependency"
echo "   2. Copy the template files from the documentation"
echo "   3. Implement your IM SDK integration"
echo "   4. Test with: pnpm openclaw gateway run"
```

## Testing Checklist

- [ ] Plugin is discovered by OpenClaw
- [ ] Configuration is loaded correctly
- [ ] Gateway starts without errors
- [ ] Can send text messages
- [ ] Can receive text messages
- [ ] Status monitoring works
- [ ] Connection probe works
- [ ] Graceful shutdown works
- [ ] Error handling is robust
- [ ] Logs are informative

## Common Issues

### Plugin not discovered

```bash
# Check if plugin is in the right location
ls -la extensions/your-im/

# Verify package.json has openclaw.extensions field
cat extensions/your-im/package.json | grep -A 5 openclaw
```

### Import errors

```bash
# Make sure you're using workspace:* for openclaw dependency
# and importing from "openclaw/plugin-sdk"
```

### Connection issues

```bash
# Check logs
openclaw gateway run --verbose

# Test probe
openclaw channels status --probe
```
