import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, ProluofireImChannelConfig, ResolvedProluofireImAccount } from "./types.js";
import { validateAuthConfig } from "./config-schema.js";

/**
 * List all configured proluofire-im account IDs
 */
export function listProluofireImAccountIds(cfg: CoreConfig): string[] {
  const channelConfig = cfg.channels?.proluofireIm;
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
  const channelConfig = cfg.channels?.proluofireIm;
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

/**
 * Resolve a specific proluofire-im account configuration
 */
export function resolveProluofireImAccount(params: {
  cfg: CoreConfig;
  accountId?: string;
}): ResolvedProluofireImAccount {
  const { cfg, accountId: rawAccountId } = params;
  const accountId = rawAccountId ?? DEFAULT_ACCOUNT_ID;
  const channelConfig = cfg.channels?.proluofireIm;

  if (!channelConfig) {
    return {
      accountId,
      name: null,
      enabled: false,
      configured: false,
      serverUrl: "",
      config: {},
    };
  }

  // Resolve account-specific config
  let accountConfig: ProluofireImChannelConfig;
  let accountName: string | null = null;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    // Use top-level config for default account
    accountConfig = channelConfig;
    accountName = channelConfig.name ?? null;
  } else {
    // Use named account config
    const namedAccount = channelConfig.accounts?.[accountId];
    if (!namedAccount) {
      return {
        accountId,
        name: null,
        enabled: false,
        configured: false,
        serverUrl: "",
        config: {},
      };
    }
    accountConfig = namedAccount;
    accountName = namedAccount.name ?? null;
  }

  // Check if account is configured
  const configured = isAccountConfigured(accountConfig);

  return {
    accountId,
    name: accountName,
    enabled: accountConfig.enabled ?? false,
    configured,
    serverUrl: accountConfig.serverUrl ?? "",
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
