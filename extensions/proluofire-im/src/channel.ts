import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelSetupInput,
  type ChannelPlugin,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";

import { ProluofireImConfigSchema } from "./config-schema.js";
import type { CoreConfig, ResolvedProluofireImAccount } from "./types.js";
import {
  listProluofireImAccountIds,
  resolveDefaultProluofireImAccountId,
  resolveProluofireImAccount,
} from "./accounts.js";
import { sendMessageProluofireIm } from "./send.js";
import {
  formatProluofireImGroupEntry,
  formatProluofireImUserEntry,
  normalizeProluofireImAllowEntry,
  normalizeProluofireImGroupId,
  normalizeProluofireImUserId,
  normalizeTarget,
} from "./protocol.js";
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

type ProluofireImSetupInput = ChannelSetupInput & {
  serverUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  mediaMaxMb?: number;
};

/**
 * Build config update for proluofire-im
 */
function buildProluofireImConfigUpdate(
  cfg: CoreConfig,
  accountId: string,
  input: {
    serverUrl?: string;
    webhookPath?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    mediaMaxMb?: number;
  },
): CoreConfig {
  const existing = cfg.channels?.["proluofire-im"] ?? {};
  if (accountId !== DEFAULT_ACCOUNT_ID) {
    const nextAccounts = {
      ...(existing.accounts ?? {}),
      [accountId]: {
        ...(existing.accounts?.[accountId] ?? {}),
        enabled: true,
        ...(input.serverUrl ? { serverUrl: input.serverUrl } : {}),
        ...(input.webhookPath ? { webhookPath: input.webhookPath } : {}),
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        ...(input.username ? { username: input.username } : {}),
        ...(input.password ? { password: input.password } : {}),
        ...(typeof input.mediaMaxMb === "number" ? { mediaMaxMb: input.mediaMaxMb } : {}),
      },
    };
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        "proluofire-im": {
          ...existing,
          enabled: true,
          accounts: nextAccounts,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "proluofire-im": {
        ...existing,
        enabled: true,
        ...(input.serverUrl ? { serverUrl: input.serverUrl } : {}),
        ...(input.webhookPath ? { webhookPath: input.webhookPath } : {}),
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
    normalizeAllowEntry: (entry) => normalizeProluofireImAllowEntry(entry),
    notifyApproval: async ({ id, cfg }) => {
      const target = formatProluofireImUserEntry(String(id));
      if (!target) return;
      await sendMessageProluofireIm(target, PAIRING_APPROVED_MESSAGE, {
        cfg: cfg as CoreConfig,
        accountId: DEFAULT_ACCOUNT_ID,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    reactions: false,
    threads: false,
    media: false,
  },
  reload: { configPrefixes: ["channels.proluofire-im"] },
  configSchema: buildChannelConfigSchema(ProluofireImConfigSchema),
  config: {
    listAccountIds: (cfg) => listProluofireImAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveProluofireImAccount({ cfg: cfg as CoreConfig, accountId: accountId ?? undefined }),
    defaultAccountId: (cfg) => resolveDefaultProluofireImAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "proluofire-im",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "proluofire-im",
        accountId,
        clearBaseFields: [
          "name",
          "serverUrl",
          "wsUrl",
          "webhookPath",
          "apiKey",
          "username",
          "password",
          "mediaMaxMb",
        ],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name ?? undefined,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.serverUrl,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveProluofireImAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      }).config.dm?.allowFrom ?? []).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => formatProluofireImUserEntry(String(entry))).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ account, cfg, accountId }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as CoreConfig).channels?.["proluofire-im"]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.proluofire-im.accounts.${resolvedAccountId}.`
        : "channels.proluofire-im.";
      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? [],
        policyPath: `${basePath}dm.policy`,
        allowFromPath: `${basePath}dm.allowFrom`,
        approveHint: formatPairingApproveHint("proluofire-im"),
        normalizeEntry: (raw) => normalizeProluofireImAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const coreConfig = cfg as CoreConfig;
      const defaultGroupPolicy = (coreConfig.channels as OpenClawConfig["channels"])?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        "- Proluofire IM groups: groupPolicy=\"open\" allows any group to trigger. Set channels.proluofire-im.groupPolicy=\"allowlist\" + channels.proluofire-im.groups to restrict groups.",
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, groupId }) => {
      const channelConfig = (cfg as CoreConfig).channels?.["proluofire-im"];
      const groups = channelConfig?.groups ?? {};
      const normalizedId = groupId ? normalizeProluofireImGroupId(groupId) : "";
      const entry = normalizedId
        ? Object.entries(groups).find(
            ([key]) => normalizeProluofireImGroupId(key) === normalizedId,
          )?.[1]
        : undefined;
      const wildcard = groups["*"];
      if (typeof entry?.requireMention === "boolean") return entry.requireMention;
      if (typeof wildcard?.requireMention === "boolean") return wildcard.requireMention;
      return true;
    },
    resolveToolPolicy: () => {
      // TODO: Implement group tool policy based on proluofire-im configuration
      // Return undefined to use default behavior
      return undefined;
    },
  },
  messaging: {
    normalizeTarget: (raw) => normalizeTarget(raw) || undefined,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^proluofire-im:/i.test(trimmed)) return true;
        if (trimmed.startsWith("@") || trimmed.startsWith("#")) return true;
        if (/^\d+$/.test(trimmed)) return true;
        return false;
      },
      hint: "<roomId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveProluofireImAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      });
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();

      // Collect user IDs from allowFrom lists
      for (const entry of account.config.dm?.allowFrom ?? []) {
        const normalized = normalizeProluofireImUserId(String(entry));
        if (!normalized || normalized === "*") continue;
        ids.add(normalized);
      }

      for (const entry of account.config.groupAllowFrom ?? []) {
        const normalized = normalizeProluofireImUserId(String(entry));
        if (!normalized || normalized === "*") continue;
        ids.add(normalized);
      }

      // Collect users from group configurations
      const groups = account.config.groups ?? {};
      for (const group of Object.values(groups)) {
        for (const entry of group.users ?? []) {
          const normalized = normalizeProluofireImUserId(String(entry));
          if (!normalized || normalized === "*") continue;
          ids.add(normalized);
        }
      }

      return Array.from(ids)
        .filter(Boolean)
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({
          kind: "user" as const,
          id: formatProluofireImUserEntry(id),
        }));
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveProluofireImAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      });
      const q = query?.trim().toLowerCase() || "";
      const groups = account.config.groups ?? {};
      return Object.keys(groups)
        .map((raw) => normalizeProluofireImGroupId(raw))
        .filter((id) => Boolean(id) && id !== "*")
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group" as const, id: formatProluofireImGroupEntry(id) }));
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "proluofire-im",
        accountId,
        name,
      }),
    validateInput: ({ input, accountId }) => {
      const setupInput = input as ProluofireImSetupInput;
      if (setupInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Environment-based auth can only be used for the default account.";
      }
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
    applyAccountConfig: ({ cfg, input, accountId }) => {
      const setupInput = input as ProluofireImSetupInput;
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "proluofire-im",
        accountId,
        name: setupInput.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "proluofire-im",
            })
          : namedConfig;

      if (setupInput.useEnv) {
        return {
          ...next,
          channels: {
            ...next.channels,
            "proluofire-im": {
              ...(next.channels?.["proluofire-im"] ?? {}),
              enabled: true,
            },
          },
        } as CoreConfig;
      }

      return buildProluofireImConfigUpdate(next as CoreConfig, accountId, {
        serverUrl: setupInput.serverUrl?.trim(),
        webhookPath: setupInput.webhookPath?.trim(),
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
          accountId: account.accountId,
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
          wsUrl: account.wsUrl,
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
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
          statusSink: (patch) => {
            ctx.setStatus({
              ...ctx.getStatus(),
              ...patch,
            });
          },
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
