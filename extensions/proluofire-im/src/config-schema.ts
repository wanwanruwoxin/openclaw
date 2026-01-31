import { z } from "zod";

// URL validation schema
const urlSchema = z
  .string()
  .url("Must be a valid URL")
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://",
  );

// DM policy schema
const dmPolicySchema = z.object({
  policy: z.enum(["pairing", "allowlist", "open"]).optional(),
  allowFrom: z.array(z.string()).optional(),
});

// Group configuration schema
const groupConfigSchema = z.object({
  users: z.array(z.string()).optional(),
});

// Media configuration schema
const mediaMaxMbSchema = z
  .number()
  .positive("Media size limit must be positive")
  .optional()
  .default(50);

// Base account configuration schema
const baseAccountConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  serverUrl: urlSchema.optional(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  dm: dmPolicySchema.optional(),
  groupPolicy: z.enum(["allowlist", "open"]).optional(),
  groups: z.record(z.string(), groupConfigSchema).optional(),
  groupAllowFrom: z.array(z.string()).optional(),
  mediaMaxMb: mediaMaxMbSchema,
});

// Multi-account configuration schema
const accountsSchema = z.record(z.string(), baseAccountConfigSchema);

// Main channel configuration schema
export const ProluofireImConfigSchema = baseAccountConfigSchema.extend({
  accounts: accountsSchema.optional(),
});

// Validation helper to check authentication completeness
export function validateAuthConfig(config: {
  apiKey?: string;
  username?: string;
  password?: string;
}): { valid: boolean; error?: string } {
  const hasApiKey = Boolean(config.apiKey?.trim());
  const hasUsername = Boolean(config.username?.trim());
  const hasPassword = Boolean(config.password?.trim());

  // Valid if has API key
  if (hasApiKey) {
    return { valid: true };
  }

  // Valid if has both username and password
  if (hasUsername && hasPassword) {
    return { valid: true };
  }

  // Invalid cases
  if (!hasApiKey && !hasUsername && !hasPassword) {
    return {
      valid: false,
      error: "Authentication required: provide apiKey or username+password",
    };
  }

  if (hasUsername && !hasPassword) {
    return {
      valid: false,
      error: "Password required when username is provided",
    };
  }

  if (hasPassword && !hasUsername) {
    return {
      valid: false,
      error: "Username required when password is provided",
    };
  }

  return { valid: false, error: "Invalid authentication configuration" };
}

// Validation helper to check account name uniqueness
export function validateAccountNameUniqueness(accounts: Record<string, { name?: string }>): {
  valid: boolean;
  error?: string;
} {
  const names = Object.values(accounts)
    .map((acc) => acc.name?.trim())
    .filter(Boolean);

  const uniqueNames = new Set(names);

  if (names.length !== uniqueNames.size) {
    return {
      valid: false,
      error: "Account names must be unique",
    };
  }

  return { valid: true };
}

export type ProluofireImConfig = z.infer<typeof ProluofireImConfigSchema>;
