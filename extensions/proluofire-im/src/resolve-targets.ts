import type { CoreConfig } from "./types.js";
import { resolveTarget, validateTarget } from "./protocol.js";

/**
 * Resolve proluofire-im targets for messaging
 *
 * TODO: Integrate with OpenClaw's target resolution system
 * - Handle user lookups
 * - Handle group lookups
 * - Validate target formats
 * - Support multiple target formats (username, ID, etc.)
 */
export async function resolveProluofireImTargets(params: {
  cfg: CoreConfig;
  inputs: string[];
  kind?: "user" | "group";
  runtime: unknown;
}): Promise<
  Array<{
    input: string;
    resolved: boolean;
    id?: string;
    name?: string;
    note?: string;
  }>
> {
  const { inputs, kind } = params;

  return inputs.map((input) => {
    try {
      // Validate target
      const validation = validateTarget(input);
      if (!validation.valid) {
        return {
          input,
          resolved: false,
          note: validation.error,
        };
      }

      // Resolve target
      const resolved = resolveTarget(input);

      // If kind is specified, validate it matches
      if (kind && resolved.type !== kind) {
        return {
          input,
          resolved: false,
          note: `Expected ${kind} but got ${resolved.type}`,
        };
      }

      return {
        input,
        resolved: true,
        id: resolved.normalized,
        name: resolved.normalized,
      };
    } catch (error) {
      return {
        input,
        resolved: false,
        note: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * Resolve user target
 */
export async function resolveUserTarget(params: {
  cfg: CoreConfig;
  input: string;
}): Promise<{ id: string; name?: string; error?: string }> {
  const { input } = params;

  try {
    const validation = validateTarget(input);
    if (!validation.valid) {
      return { id: input, error: validation.error };
    }

    const resolved = resolveTarget(input);
    if (resolved.type !== "user") {
      return { id: input, error: "Not a user identifier" };
    }

    // TODO: Optionally look up user details from proluofire-im API
    // const userInfo = await client.getUserInfo(resolved.id);
    // return { id: resolved.id, name: userInfo.name };

    return { id: resolved.normalized };
  } catch (error) {
    return {
      id: input,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve group target
 */
export async function resolveGroupTarget(params: {
  cfg: CoreConfig;
  input: string;
}): Promise<{ id: string; name?: string; error?: string }> {
  const { input } = params;

  try {
    const validation = validateTarget(input);
    if (!validation.valid) {
      return { id: input, error: validation.error };
    }

    const resolved = resolveTarget(input);
    if (resolved.type !== "group") {
      return { id: input, error: "Not a group identifier" };
    }

    // TODO: Optionally look up group details from proluofire-im API
    // const groupInfo = await client.getGroupInfo(resolved.id);
    // return { id: resolved.id, name: groupInfo.name };

    return { id: resolved.normalized };
  } catch (error) {
    return {
      id: input,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search for users
 *
 * TODO: Implement user search if proluofire-im provides search API
 */
export async function searchUsers(params: {
  cfg: CoreConfig;
  query: string;
  limit?: number;
}): Promise<Array<{ id: string; name: string }>> {
  const { query, limit = 10 } = params;

  void query;
  void limit;

  // TODO: Implement actual user search
  // const results = await client.searchUsers(query, limit);
  // return results.map(user => ({ id: user.id, name: user.name }));

  return [];
}

/**
 * Search for groups
 *
 * TODO: Implement group search if proluofire-im provides search API
 */
export async function searchGroups(params: {
  cfg: CoreConfig;
  query: string;
  limit?: number;
}): Promise<Array<{ id: string; name: string }>> {
  const { query, limit = 10 } = params;

  void query;
  void limit;

  // TODO: Implement actual group search
  // const results = await client.searchGroups(query, limit);
  // return results.map(group => ({ id: group.id, name: group.name }));

  return [];
}
