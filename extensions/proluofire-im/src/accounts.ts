import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, ProluofireImChannelConfig, ResolvedProluofireImAccount } from "./types.js";
import { validateAuthConfig } from "./config-schema.js";

/**
 * List all configured proluofire-im account IDs
 */
export function listProluofireImAccountIds(cfg: CoreConfig): string[] {
  const channelConfig = cfg.channels?.["proluofire-im"];
  if (!channelConfig) return [];

  const ids: string[] = [];

  // Check if top-level config exists (default account)
  if (channelConfig.serverUrl) {
    ids.push(DEFAULT_ACCOUNT_ID);
  }

  // Check for named accounts
  if (channelConfig.accounts) {
    ids.push(...Object.keys(channelConfig.accounts));
  }

  return ids;
}

/**
 * Resolve the default proluofire-im account ID
 */
export function resolveDefaultProluofireImAccountId(cfg: CoreConfig): string {
  const channelConfig = cfg.channels?.["proluofire-im"];
  if (!channelConfig) return DEFAULT_ACCOUNT_ID;

  // If top-level config exists, use default account
  if (channelConfig.serverUrl) {
    return DEFAULT_ACCOUNT_ID;
  }

  // Otherwise, use first account from accounts object
  if (channelConfig.accounts) {
    const accountIds = Object.keys(channelConfig.accounts);
    if (accountIds.length > 0) {
      return accountIds[0];
    }
  }

  return DEFAULT_ACCOUNT_ID;
}

function mergeProluofireImAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): ProluofireImChannelConfig {
  const channelConfig = cfg.channels?.["proluofire-im"] ?? {};
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return channelConfig;
  }
  const { accounts: _ignored, ...base } = channelConfig;
  const account = channelConfig.accounts?.[accountId] ?? {};
  return { ...base, ...account };
}

/**
 * Resolve a specific proluofire-im account configuration
 */
export function resolveProluofireImAccount(params: {
  cfg: CoreConfig;
  accountId?: string;
}): ResolvedProluofireImAccount {
  const { cfg, accountId: rawAccountId } = params;
  const accountId = rawAccountId ?? DEFAULT_ACCOUNT_ID;
  const channelConfig = cfg.channels?.["proluofire-im"];

  if (!channelConfig) {
    return {
      accountId,
      name: null,
      enabled: false,
      configured: false,
      serverUrl: "",
      wsUrl: "",
      config: {},
    };
  }
  if (accountId !== DEFAULT_ACCOUNT_ID && !channelConfig.accounts?.[accountId]) {
    return {
      accountId,
      name: null,
      enabled: false,
      configured: false,
      serverUrl: "",
      wsUrl: "",
      config: {},
    };
  }

  const accountConfig = mergeProluofireImAccountConfig(cfg, accountId);
  const accountName = accountConfig.name ?? null;
  const baseEnabled = channelConfig.enabled !== false;
  const accountEnabled = accountConfig.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  // Check if account is configured
  const configured = isAccountConfigured(accountConfig);

  return {
    accountId,
    name: accountName,
    enabled,
    configured,
    serverUrl: accountConfig.serverUrl ?? "",
    wsUrl: accountConfig.wsUrl,
    apiKey: accountConfig.apiKey,
    username: accountConfig.username,
    password: accountConfig.password,
    config: accountConfig,
  };
}

/**
 * Validate if an account is properly configured
 */
function isAccountConfigured(config: ProluofireImChannelConfig): boolean {
  // Must have server URL
  if (!config.serverUrl?.trim()) {
    return false;
  }

  // Must have valid authentication
  const authValidation = validateAuthConfig({
    apiKey: config.apiKey,
    username: config.username,
    password: config.password,
  });

  return authValidation.valid;
}

/**
 * Get account configuration validation errors
 */
export function getAccountConfigErrors(config: ProluofireImChannelConfig): string[] {
  const errors: string[] = [];

  // Check server URL
  if (!config.serverUrl?.trim()) {
    errors.push("Server URL is required");
  }

  // Check authentication
  const authValidation = validateAuthConfig({
    apiKey: config.apiKey,
    username: config.username,
    password: config.password,
  });

  if (!authValidation.valid && authValidation.error) {
    errors.push(authValidation.error);
  }

  return errors;
}
