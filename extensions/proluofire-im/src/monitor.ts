import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DEFAULT_ACCOUNT_ID,
  logInboundDrop,
  resolveControlCommandGate,
  resolveMentionGatingWithBypass,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type {
  CoreConfig,
  ProluofireImAttachment,
  ProluofireImClient,
  ProluofireImMessage,
  ResolvedProluofireImAccount,
} from "./types.js";
import { resolveProluofireImAccount } from "./accounts.js";
import {
  decodeMessage,
  extractMetadata,
  formatProluofireImGroupEntry,
  formatProluofireImUserEntry,
  normalizeProluofireImAllowEntry,
  normalizeProluofireImGroupId,
  normalizeProluofireImUserId,
  normalizeTarget,
} from "./protocol.js";
import {
  getProluofireImRuntime,
  markInboundMessage,
  registerClientForAccount,
  unregisterClientForAccount,
} from "./runtime.js";
import { sendMessageProluofireIm } from "./send.js";
import {
  handleWebhookRequest,
  registerClientForWebhook,
  unregisterClientForWebhook,
} from "./webhook.js";

const CHANNEL_ID = "proluofire-im" as const;
const DEFAULT_WEBHOOK_PATH = "/webhook/proluofire-im";
const WEBHOOK_MAX_BYTES = 1024 * 1024;

type ProluofireImStatusSink = (patch: {
  lastInboundAt?: number;
  lastOutboundAt?: number;
  lastError?: string | null;
}) => void;

type WebhookTarget = {
  account: ResolvedProluofireImAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  core: ReturnType<typeof getProluofireImRuntime>;
  path: string;
  statusSink?: ProluofireImStatusSink;
};

const webhookTargets = new Map<string, WebhookTarget[]>();

function normalizeWebhookPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withSlash.replace(/\/+$/, "");
  return normalized || "/";
}

function resolveWebhookPath(account: ResolvedProluofireImAccount): string {
  const configured = account.config.webhookPath?.trim();
  if (configured) return normalizeWebhookPath(configured);
  if (account.accountId === DEFAULT_ACCOUNT_ID) return DEFAULT_WEBHOOK_PATH;
  return normalizeWebhookPath(`${DEFAULT_WEBHOOK_PATH}/${account.accountId}`);
}

function registerWebhookTarget(target: WebhookTarget): () => void {
  const key = normalizeWebhookPath(target.path);
  const existing = webhookTargets.get(key) ?? [];
  const next = existing.some((entry) => entry.account.accountId === target.account.accountId)
    ? existing.map((entry) =>
        entry.account.accountId === target.account.accountId ? target : entry,
      )
    : [...existing, target];
  webhookTargets.set(key, next);
  return () => {
    const current = webhookTargets.get(key) ?? [];
    const filtered = current.filter(
      (entry) => entry.account.accountId !== target.account.accountId,
    );
    if (filtered.length === 0) {
      webhookTargets.delete(key);
    } else {
      webhookTargets.set(key, filtered);
    }
  };
}

function logVerbose(
  core: ReturnType<typeof getProluofireImRuntime>,
  runtime: RuntimeEnv,
  message: string,
): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log(`[proluofire-im] ${message}`);
  }
}

function normalizeAllowlist(list: string[] | undefined | null): string[] {
  if (!list || !Array.isArray(list)) return [];
  // Ensure we map each item safely and filter out empty strings
  return list
    .map((item) => {
      try {
        if (typeof item !== "string") return "";
        return normalizeProluofireImAllowEntry(item);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function isAllowedSender(allowList: string[], senderId: string): boolean {
  if (allowList.includes("*")) return true;
  return allowList.includes(senderId);
}

type GroupMatch = {
  entry?: { users?: string[]; requireMention?: boolean };
  wildcard?: { users?: string[]; requireMention?: boolean };
  allowed: boolean;
  allowlistConfigured: boolean;
};

function resolveGroupMatch(params: {
  groups?: Record<string, { users?: string[]; requireMention?: boolean }>;
  groupId: string;
  groupPolicy: "allowlist" | "open" | "disabled";
}): GroupMatch {
  const groups = params.groups ?? {};
  const allowlistConfigured = Object.keys(groups).length > 0;
  const normalized = normalizeProluofireImGroupId(params.groupId);
  const matchedKey = normalized
    ? Object.keys(groups).find((key) => normalizeProluofireImGroupId(key) === normalized)
    : undefined;
  const entry = matchedKey ? groups[matchedKey] : undefined;
  const wildcard = groups["*"];
  const allowed =
    params.groupPolicy === "open"
      ? true
      : params.groupPolicy === "disabled"
        ? false
        : allowlistConfigured
          ? Boolean(entry || wildcard)
          : false;
  return { entry, wildcard, allowed, allowlistConfigured };
}

function resolveRequireMention(match: GroupMatch): boolean {
  if (typeof match.entry?.requireMention === "boolean") return match.entry.requireMention;
  if (typeof match.wildcard?.requireMention === "boolean") return match.wildcard.requireMention;
  return true;
}

async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return await new Promise((resolve) => {
    let resolved = false;
    let total = 0;
    let raw = "";

    const finish = (result: { ok: true; value: unknown } | { ok: false; error: string }) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    req.on("data", (chunk) => {
      if (resolved) return;
      total += chunk.length;
      if (total > maxBytes) {
        finish({ ok: false, error: "payload too large" });
        try {
          req.destroy();
        } catch {}
        return;
      }
      raw += chunk.toString("utf8");
    });

    req.on("end", () => {
      if (resolved) return;
      if (!raw.trim()) {
        finish({ ok: false, error: "empty payload" });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        finish({ ok: true, value: parsed });
      } catch {
        finish({ ok: false, error: "invalid json" });
      }
    });

    req.on("error", () => {
      finish({ ok: false, error: "read error" });
    });
  });
}

function readAccountHint(params: {
  url: URL;
  headers: Record<string, string>;
  payload?: unknown;
}): string {
  const fromQuery =
    params.url.searchParams.get("accountId") ??
    params.url.searchParams.get("account") ??
    params.url.searchParams.get("account_id");
  if (fromQuery) return fromQuery.trim();
  const fromHeader =
    params.headers["x-openclaw-account"] ??
    params.headers["x-proluofire-account"] ??
    params.headers["x-account-id"];
  if (fromHeader) return fromHeader.trim();
  if (params.payload && typeof params.payload === "object") {
    const payloadRecord = params.payload as Record<string, unknown>;
    const payloadAccount =
      typeof payloadRecord.accountId === "string"
        ? payloadRecord.accountId
        : typeof payloadRecord.account === "string"
          ? payloadRecord.account
          : undefined;
    if (payloadAccount) return payloadAccount.trim();
  }
  return "";
}

function normalizeHeaderRecord(headers: IncomingMessage["headers"]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      record[key.toLowerCase()] = value[0] ?? "";
    } else if (typeof value === "string") {
      record[key.toLowerCase()] = value;
    }
  }
  return record;
}

export async function handleProluofireImWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = normalizeWebhookPath(url.pathname);
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) return false;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readJsonBody(req, WEBHOOK_MAX_BYTES);
  if (!body.ok) {
    res.statusCode = body.error === "payload too large" ? 413 : 400;
    res.end(body.error);
    return true;
  }

  const headers = normalizeHeaderRecord(req.headers);
  const accountHint = readAccountHint({ url, headers, payload: body.value });
  let matching = targets;
  if (accountHint) {
    matching = targets.filter(
      (target) => target.account.accountId.toLowerCase() === accountHint.toLowerCase(),
    );
  } else if (targets.length > 1) {
    const fallback =
      targets.find((target) => target.account.accountId === DEFAULT_ACCOUNT_ID) ?? targets[0];
    matching = fallback ? [fallback] : [];
  }

  if (matching.length === 0) {
    res.statusCode = 404;
    res.end("unknown account");
    return true;
  }

  for (const target of matching) {
    logVerbose(
      target.core,
      target.runtime,
      `webhook received path=${path} account=${target.account.accountId}`,
    );
    const result = await handleWebhookRequest({
      accountId: target.account.accountId,
      payload: body.value,
      headers,
    });
    if (!result.success) {
      target.runtime.error?.(
        `[proluofire-im] webhook error (${target.account.accountId}): ${result.error ?? "unknown"}`,
      );
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ success: true }));
  return true;
}

export async function monitorProluofireImProvider(params: {
  client: ProluofireImClient;
  accountId: string;
  config: CoreConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: ProluofireImStatusSink;
}): Promise<void> {
  const { client, accountId, config, runtime, abortSignal, statusSink } = params;
  const core = getProluofireImRuntime();
  const account = resolveProluofireImAccount({ cfg: config, accountId });
  const webhookPath = resolveWebhookPath(account);

  registerClientForWebhook(accountId, client);
  registerClientForAccount(accountId, client);
  const unregisterTarget = registerWebhookTarget({
    account,
    config,
    runtime,
    core,
    path: webhookPath,
    statusSink,
  });

  logVerbose(core, runtime, `monitor started account=${accountId} path=${webhookPath}`);

  client.onMessage(async (message) => {
    try {
      await handleIncomingMessage({
        message,
        account,
        config,
        runtime,
        statusSink,
      });
    } catch (error) {
      runtime.error(`[proluofire-im] message handling error: ${String(error)}`);
    }
  });

  client.onConnectionStatus((status) => {
    if (status.connected) {
      logVerbose(core, runtime, `connected account=${accountId}`);
    } else {
      runtime.error(
        `[proluofire-im] disconnected account=${accountId}: ${status.error ?? "unknown"}`,
      );
    }
  });

  await new Promise<void>((resolve) => {
    abortSignal.addEventListener("abort", () => {
      unregisterTarget();
      unregisterClientForWebhook(accountId);
      unregisterClientForAccount(accountId, client);
      logVerbose(core, runtime, `monitor stopped account=${accountId}`);
      resolve();
    });
  });
}

async function handleIncomingMessage(params: {
  message: ProluofireImMessage;
  account: ResolvedProluofireImAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: ProluofireImStatusSink;
}): Promise<void> {
  const { message, account, config, runtime, statusSink } = params;
  const core = getProluofireImRuntime();

  const decoded = decodeMessage(message);
  const metadata = extractMetadata(message);
  const rawBody = decoded.content ?? "";
  runtime.log(`[proluofire-im] received rawBody: ${JSON.stringify(rawBody)}`);
  const attachments = message.attachments ?? [];
  if (!rawBody.trim() && attachments.length === 0) return;

  const fromTarget = normalizeTarget(String(decoded.from ?? message.from ?? ""));
  const toTarget = normalizeTarget(String(message.to ?? ""));
  const isGroup = Boolean(toTarget && toTarget.startsWith("#"));
  const senderId = normalizeProluofireImUserId(String(fromTarget || message.from || ""));
  const groupId = isGroup ? normalizeProluofireImGroupId(String(toTarget)) : "";

  runtime.log(
    `[proluofire-im] processing message: isGroup=${isGroup}, toTarget=${toTarget}, senderId=${senderId}, roomId=${message.roomId ?? ""}, rawBody=${JSON.stringify(rawBody)}`,
  );

  statusSink?.({ lastInboundAt: Date.now() });

  const dmPolicy = account.config.dm?.policy ?? "pairing";
  const defaultGroupPolicy = (config.channels as OpenClawConfig["channels"])?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  const configAllowFrom = normalizeAllowlist(account.config.dm?.allowFrom);
  const configGroupAllowFrom = normalizeAllowlist(account.config.groupAllowFrom);
  const storeAllowFrom = await core.channel.pairing.readAllowFromStore(CHANNEL_ID).catch(() => []);
  const storeAllowList = normalizeAllowlist(storeAllowFrom);

  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowList].filter(Boolean);
  const baseGroupAllowFrom =
    configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom;
  const effectiveGroupAllowFrom = [...baseGroupAllowFrom, ...storeAllowList].filter(Boolean);

  const groupMatch = isGroup
    ? resolveGroupMatch({
        groups: account.config.groups,
        groupId: toTarget,
        groupPolicy,
      })
    : { allowed: true, allowlistConfigured: false };

  if (isGroup && groupPolicy === "disabled") {
    runtime.log(`[proluofire-im] drop group ${toTarget} (groupPolicy=disabled)`);
    return;
  }

  if (isGroup && groupPolicy !== "open" && !groupMatch.allowed) {
    runtime.log(
      `[proluofire-im] drop group ${toTarget} (not allowlisted) - policy: ${groupPolicy}, matched: ${!!groupMatch.entry}, wildcard: ${!!groupMatch.wildcard}`,
    );
    return;
  }

  const senderAllowed = dmPolicy === "open" ? true : isAllowedSender(effectiveAllowFrom, senderId);

  const groupUsers = normalizeAllowlist(groupMatch.entry?.users);
  const senderAllowedForGroup = (() => {
    if (!isGroup) return true;
    const allowFrom = groupUsers.length > 0 ? groupUsers : effectiveGroupAllowFrom;
    if (allowFrom.length === 0) return true;
    return isAllowedSender(allowFrom, senderId);
  })();

  if (isGroup && !senderAllowedForGroup) {
    runtime.log(
      `[proluofire-im] drop group sender ${senderId} (not allowlisted) - groupUsers: ${groupUsers.join(",")}, effectiveGroupAllowFrom: ${effectiveGroupAllowFrom.join(",")}`,
    );
    return;
  }

  if (!isGroup) {
    if (!senderAllowed) {
      if (dmPolicy === "pairing") {
        const { code, created } = await core.channel.pairing.upsertPairingRequest({
          channel: CHANNEL_ID,
          id: senderId,
          meta: { name: formatProluofireImUserEntry(senderId) },
        });
        if (created) {
          try {
            await sendMessageProluofireIm(
              formatProluofireImUserEntry(senderId),
              core.channel.pairing.buildPairingReply({
                channel: CHANNEL_ID,
                idLine: `Your Proluofire IM user id: ${formatProluofireImUserEntry(senderId)}`,
                code,
              }),
              { cfg: config, accountId: account.accountId },
            );
            statusSink?.({ lastOutboundAt: Date.now() });
          } catch (err) {
            runtime.error(`[proluofire-im] pairing reply failed for ${senderId}: ${String(err)}`);
          }
        }
      }
      runtime.log(`[proluofire-im] drop DM sender ${senderId} (dmPolicy=${dmPolicy})`);
      return;
    }
  }

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg: config as OpenClawConfig,
    surface: CHANNEL_ID,
  });
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const hasControlCommand = core.channel.text.hasControlCommand(rawBody, config as OpenClawConfig);
  const commandAllowFrom = isGroup
    ? groupUsers.length > 0
      ? groupUsers
      : effectiveGroupAllowFrom
    : effectiveAllowFrom;
  const senderAllowedForCommands = isAllowedSender(commandAllowFrom, senderId);
  const commandGate = resolveControlCommandGate({
    useAccessGroups,
    authorizers: [
      {
        configured: (isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom).length > 0,
        allowed: senderAllowedForCommands,
      },
    ],
    allowTextCommands,
    hasControlCommand,
  });
  const commandAuthorized = isGroup
    ? commandGate.commandAuthorized
    : senderAllowed || dmPolicy === "open";

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: (message) => runtime.log(message),
      channel: CHANNEL_ID,
      reason: "control command (unauthorized)",
      target: senderId,
    });
    return;
  }

  runtime.log(
    `[proluofire-im] resolving agent route... isGroup=${isGroup}, toTarget=${toTarget}, senderId=${senderId}`,
  );
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: isGroup ? toTarget : senderId,
    },
  });
  runtime.log(
    `[proluofire-im] route resolved: agentId=${route.agentId}, sessionKey=${route.sessionKey}`,
  );

  runtime.log(`[proluofire-im] calculating mentionRegexes...`);
  const mentionRegexes = core.channel.mentions.buildMentionRegexes(
    config as OpenClawConfig,
    route.agentId,
  );
  runtime.log(`[proluofire-im] mentionRegexes: ${mentionRegexes}`);

  const wasMentioned =
    isGroup && mentionRegexes.length > 0
      ? core.channel.mentions.matchesMentionPatterns(rawBody, mentionRegexes)
      : false;
  runtime.log(`[proluofire-im] wasMentioned: ${wasMentioned}`);

  const requireMention = isGroup ? resolveRequireMention(groupMatch) : false;
  const mentionGate = resolveMentionGatingWithBypass({
    isGroup,
    requireMention,
    canDetectMention: mentionRegexes.length > 0,
    wasMentioned,
    allowTextCommands,
    hasControlCommand,
    commandAuthorized,
  });

  if (isGroup && mentionGate.shouldSkip) {
    runtime.log(
      `[proluofire-im] drop group ${toTarget} (no mention) - rawBody: ${JSON.stringify(rawBody)}, mentionRegexes: ${mentionRegexes}`,
    );
    return;
  }

  runtime.log(
    `[proluofire-im] passed mention gate. isGroup=${isGroup}, requireMention=${requireMention}, wasMentioned=${wasMentioned}`,
  );

  // Debug log for potential type errors
  runtime.log(
    `[proluofire-im] Debug: groupId=${typeof groupId} ${JSON.stringify(groupId)}, toTarget=${typeof toTarget} ${JSON.stringify(toTarget)}, senderId=${typeof senderId} ${JSON.stringify(senderId)}, fromTarget=${typeof fromTarget} ${JSON.stringify(fromTarget)}, message.from=${typeof message.from} ${JSON.stringify(message.from)}`,
  );

  const fromLabel = isGroup
    ? formatProluofireImGroupEntry(String(groupId || toTarget || ""))
    : formatProluofireImUserEntry(String(senderId || fromTarget || message.from || ""));
  runtime.log(`[proluofire-im] resolving session path for agentId=${route.agentId}...`);
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  runtime.log(`[proluofire-im] storePath resolved: ${storePath}`);

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);

  runtime.log(`[proluofire-im] reading session updated at...`);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  runtime.log(`[proluofire-im] previousTimestamp: ${previousTimestamp}`);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Proluofire IM",
    from: fromLabel,
    timestamp: decoded.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  runtime.log(`[proluofire-im] processing message attachments: ${attachments.length}`);
  const attachment = attachments[0];
  const media = attachment
    ? await downloadAttachment({
        attachment,
        account,
        core,
        runtime,
      })
    : null;
  runtime.log(`[proluofire-im] attachment processed. media=${!!media}`);

  const replyTarget = isGroup
    ? formatProluofireImGroupEntry(groupId || toTarget)
    : message.roomId
      ? String(message.roomId)
      : formatProluofireImUserEntry(senderId || fromTarget);
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `proluofire-im:${fromTarget || message.from || ""}`,
    To: `proluofire-im:${toTarget || message.to || ""}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: formatProluofireImUserEntry(String(senderId || fromTarget || message.from || "")),
    SenderId: senderId,
    GroupChannel: isGroup
      ? formatProluofireImGroupEntry(String(groupId || toTarget || "")) || undefined
      : undefined,
    GroupSubject: isGroup ? groupId || undefined : undefined,
    WasMentioned: isGroup ? wasMentioned : undefined,
    CommandAuthorized: commandAuthorized,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.id,
    MessageSidFull: message.id,
    ReplyToId: metadata.replyTo,
    ReplyToIdFull: metadata.replyTo,
    MessageThreadId: metadata.threadId,
    MediaPath: media?.path,
    MediaUrl: media?.path,
    MediaType: media?.contentType,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `proluofire-im:${replyTarget}`,
  });

  runtime.log(`[proluofire-im] recording inbound session...`);
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error(`[proluofire-im] failed updating session meta: ${String(err)}`);
    },
  });

  runtime.log(
    `[proluofire-im] dispatching reply for sessionKey=${route.sessionKey}, agentId=${route.agentId}, from=${ctxPayload.From}, to=${ctxPayload.To}`,
  );

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      deliver: async (payload) => {
        runtime.log(
          `[proluofire-im] delivering reply: ${JSON.stringify(payload)} to ${replyTarget}`,
        );
        await deliverProluofireImReply({
          payload: payload as {
            text?: string;
            mediaUrls?: string[];
            mediaUrl?: string;
            replyToId?: string;
          },
          target: replyTarget,
          accountId: account.accountId,
          config,
          threadId: metadata.threadId,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error(`[proluofire-im] ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });

  markInboundMessage(account.accountId);
}

async function deliverProluofireImReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; replyToId?: string };
  target: string;
  accountId: string;
  config: CoreConfig;
  threadId?: string;
  statusSink?: ProluofireImStatusSink;
}): Promise<void> {
  const { payload, target, accountId, config, threadId, statusSink } = params;
  const text = payload.text ?? "";
  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];

  if (!text.trim() && mediaList.length === 0) return;

  if (mediaList.length > 0 && !text.trim()) return;

  await sendMessageProluofireIm(target, text, {
    cfg: config,
    accountId,
    replyToId: payload.replyToId,
    threadId,
  });
  statusSink?.({ lastOutboundAt: Date.now() });
}

async function downloadAttachment(params: {
  attachment: ProluofireImAttachment;
  account: ResolvedProluofireImAccount;
  core: ReturnType<typeof getProluofireImRuntime>;
  runtime: RuntimeEnv;
}): Promise<{ path: string; contentType?: string } | null> {
  const { attachment, account, core, runtime } = params;
  const url = attachment.url?.trim();
  if (!url) return null;
  const maxBytes = Math.max(1, account.config.mediaMaxMb ?? 50) * 1024 * 1024;
  try {
    const downloaded = await core.channel.media.fetchRemoteMedia({
      url,
      maxBytes,
      filePathHint: attachment.filename ?? undefined,
    });
    const saved = await core.channel.media.saveMediaBuffer(
      downloaded.buffer,
      downloaded.contentType ?? attachment.mimeType ?? attachment.type,
      "inbound",
      maxBytes,
      downloaded.fileName ?? attachment.filename,
    );
    return { path: saved.path, contentType: saved.contentType };
  } catch (err) {
    runtime.error(`[proluofire-im] failed to download attachment: ${String(err)}`);
    return null;
  }
}
