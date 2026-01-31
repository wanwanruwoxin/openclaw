import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";

import { ProluofireImConfigSchema } from "./config-schema.js";
import type { CoreConfig, ResolvedProluofireImAccount } from "./types.js";
import {
  listProluofireImAccountIds,
  resolveDefaultProluofireImAccountId,
  resolveProluofireImAccount,
} from "./accounts.js";
import { sendMessageProluofireIm } from "./send.js";
import { normalizeTarget, validateTarget } from "./protocol.js";
import { proluofireImOutbound } from "./outbound.js";
import { proluofireImMessageActions } from "./actions.js";

const meta = {
  id: "proluofire-im",
  label: "Proluofire IM",
  selectionLabel: "Proluofire IM (plugin)",
  docsPath: "/channels/proluofire-im",
  docsLabel: "proluofire-im",
  blurb: "custom IM system; configure server URL and authentication.",
  order: 80,
  quickstartAllowFrom: true,
};

/**
 * Normalize messaging target for proluofire-im
 */
function normalizeProluofireImMessagingTarget(raw: string): string | undefined {
  let normalized = raw.trim();
  if (!normalized) return undefined;

  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("proluofire-im:")) {
    normalized = normalized.slice("proluofire-im:".length).trim();
  }

  return normalized || undefined;
}

/**
 * Build config update for proluofire-im
 */
function buildProluofireImConfigUpdate(
  cfg: CoreConfig,
  input: {
    serverUrl?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    mediaMaxMb?: number;
  },
): CoreConfig {
  const existing = cfg.channels?.proluofireIm ?? {};
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      proluofireIm: {
        ...existing,
        enabled: true,
        ...(input.serverUrl ? { serverUrl: input.serverUrl } : {}),
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        ...(input.username ? { username: input.username } : {}),
        ...(input.password ? { password: input.password } : {}),
        ...(typeof input.mediaMaxMb === "number" ? { mediaMaxMb: input.mediaMaxMb } : {}),
      },
    },
  };
}

export const proluofireImPlugin: ChannelPlugin<ResolvedProluofireImAccount> = {
  id: "proluofire-im",
  meta,
  pairing: {
    idLabel: "proluofireImUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^proluofire-im:/i, "").trim(),
    notifyApproval: async ({ id }) => {
      await sendMessageProluofireIm(id, PAIRING_APPROVED_MESSAGE);
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    reactions: false,
    threads: true,
    media: true,
  },
  reload: { configPrefixes: ["channels.proluofireIm"] },
  configSchema: buildChannelConfigSchema(ProluofireImConfigSchema),
  config: {
    listAccountIds: (cfg) => listProluofireImAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveProluofireImAccount({ cfg: cfg as CoreConfig, accountId: accountId ?? undefined }),
    defaultAccountId: (cfg) => resolveDefaultProluofireImAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "proluofireIm",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "proluofireIm",
        accountId,
        clearBaseFields: ["name", "serverUrl", "apiKey", "username", "password", "mediaMaxMb"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name ?? undefined,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.serverUrl,
    }),
    resolveAllowFrom: ({ cfg }) =>
      ((cfg as CoreConfig).channels?.proluofireIm?.dm?.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dm?.policy ?? "pairing",
      allowFrom: account.config.dm?.allowFrom ?? [],
      policyPath: "channels.proluofireIm.dm.policy",
      allowFromPath: "channels.proluofireIm.dm.allowFrom",
      approveHint: formatPairingApproveHint("proluofire-im"),
      normalizeEntry: (raw) => raw.replace(/^proluofire-im:/i, "").trim().toLowerCase(),
    }),
    collectWarnings: ({ account, cfg }) => {
      const coreConfig = cfg as CoreConfig;
      const defaultGroupPolicy = (coreConfig.channels as any)?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        "- Proluofire IM groups: groupPolicy=\"open\" allows any group to trigger. Set channels.proluofireIm.groupPolicy=\"allowlist\" + channels.proluofireIm.groups to restrict groups.",
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg }) => {
      const groupPolicy = (cfg as CoreConfig).channels?.proluofireIm?.groupPolicy ?? "allowlist";
      return groupPolicy === "open";
    },
    resolveToolPolicy: () => {
      // TODO: Implement group tool policy based on proluofire-im configuration
      // Return undefined to use default behavior
      return undefined;
    },
  },
  messaging: {
    normalizeTarget: normalizeProluofireImMessagingTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // Check if it looks like a proluofire-im identifier
        // TODO: Customize based on actual proluofire-im identifier format
        if (/^(proluofire-im:)?[@#]/i.test(trimmed)) return true;
        return trimmed.includes("@") || trimmed.includes("#");
      },
      hint: "<user|group>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveProluofireImAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID
      });
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();

      // Collect user IDs from allowFrom lists
      for (const entry of account.config.dm?.allowFrom ?? []) {
        const raw = String(entry).trim();
        if (!raw || raw === "*") continue;
        ids.add(raw.replace(/^proluofire-im:/i, ""));
      }

      for (const entry of account.config.groupAllowFrom ?? []) {
        const raw = String(entry).trim();
        if (!raw || raw === "*") continue;
        ids.add(raw.replace(/^proluofire-im:/i, ""));
      }

      // Collect users from group configurations
      const groups = account.config.groups ?? {};
      for (const group of Object.values(groups)) {
        for (const entry of group.users ?? []) {
          const raw = String(entry).trim();
          if (!raw || raw === "*") continue;
          ids.add(raw.replace(/^proluofire-im:/i, ""));
        }
      }

      return Array.from(ids)
        .map((raw) => raw.trim())
        .filter(Boolean)
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({
          kind: "user" as const,
          id,
        }));
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveProluofireImAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID
      });
      const q = query?.trim().toLowerCase() || "";
      const groups = account.config.groups ?? {};
      const ids = Object.keys(groups)
        .map((raw) => raw.trim())
        .filter((raw) => Boolean(raw) && raw !== "*")
        .map((raw) => raw.replace(/^proluofire-im:/i, ""))
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group" as const, id }));
      return ids;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "proluofireIm",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      const setupInput = input as any;
      if (setupInput.useEnv) return null;
      if (!setupInput.serverUrl?.trim()) return "Proluofire IM requires --server-url";

      const hasApiKey = Boolean(setupInput.apiKey?.trim());
      const hasUsername = Boolean(setupInput.username?.trim());
      const hasPassword = Boolean(setupInput.password?.trim());

      if (!hasApiKey && !hasUsername && !hasPassword) {
        return "Proluofire IM requires --api-key or --username and --password";
      }

      if (hasUsername && !hasPassword) {
        return "Proluofire IM requires --password when using --username";
      }

      if (hasPassword && !hasUsername) {
        return "Proluofire IM requires --username when using --password";
      }

      return null;
    },
    applyAccountConfig: ({ cfg, input }) => {
      const setupInput = input as any;
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "proluofireIm",
        accountId: DEFAULT_ACCOUNT_ID,
        name: setupInput.name,
      });

      if (setupInput.useEnv) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            proluofireIm: {
              ...(namedConfig.channels?.proluofireIm ?? {}),
              enabled: true,
            },
          },
        } as CoreConfig;
      }

      return buildProluofireImConfigUpdate(namedConfig as CoreConfig, {
        serverUrl: setupInput.serverUrl?.trim(),
        apiKey: setupInput.apiKey?.trim(),
        username: setupInput.username?.trim(),
        password: setupInput.password?.trim(),
        mediaMaxMb: setupInput.mediaMaxMb,
      });
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "proluofire-im",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      baseUrl: snapshot.baseUrl ?? null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs, cfg }) => {
      const { probeProluofireImFromConfig } = await import("./probe.js");
      try {
        return await probeProluofireImFromConfig({
          cfg: cfg as CoreConfig,
          timeoutMs,
        });
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: 0,
        };
      }
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name ?? undefined,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.serverUrl,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastProbeAt: runtime?.lastProbeAt ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        baseUrl: account.serverUrl,
      });
      ctx.log?.info(
        `[${account.accountId}] starting provider (${account.serverUrl ?? "proluofire-im"})`,
      );

      // Lazy import to avoid ESM init cycles
      const { monitorProluofireImProvider } = await import("./monitor.js");
      const { createProluofireImClient } = await import("./client.js");
      const { markAccountStarted, markAccountStopped } = await import("./runtime.js");

      try {
        // Create client
        const client = await createProluofireImClient({
          serverUrl: account.serverUrl,
          apiKey: account.apiKey,
          username: account.username,
          password: account.password,
        });

        // Connect
        await client.connect();

        // Mark as started
        markAccountStarted(account.accountId);

        // Start monitoring
        await monitorProluofireImProvider({
          client,
          accountId: account.accountId,
          config: ctx.cfg as CoreConfig,
          abortSignal: ctx.abortSignal,
        });

        // Disconnect on shutdown
        await client.disconnect();

        // Mark as stopped
        markAccountStopped(account.accountId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        markAccountStopped(account.accountId, errorMsg);
        throw error;
      }
    },
  },
  outbound: proluofireImOutbound,
  actions: proluofireImMessageActions,
  resolver: {
    resolveTargets: async ({ cfg, inputs, kind, runtime }) => {
      const { resolveProluofireImTargets } = await import("./resolve-targets.js");
      return resolveProluofireImTargets({ cfg, inputs, kind, runtime });
    },
  },
};
