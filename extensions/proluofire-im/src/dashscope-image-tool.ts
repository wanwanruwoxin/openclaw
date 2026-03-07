import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_ACCOUNT_ID,
  extensionForMime,
  jsonResult,
  readStringParam,
  type OpenClawConfig,
  type OpenClawPluginApi,
  type OpenClawPluginToolContext,
} from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { resolveDirectRoomForTarget } from "./runtime.js";
import { sendMessageWithMedia } from "./send.js";

const DASHSCOPE_PROVIDER_ID = "dashscope";
const DEFAULT_IMAGE_PROVIDER = DASHSCOPE_PROVIDER_ID;
const DEFAULT_IMAGE_MODEL = "qwen-image-2.0";
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const NATIVE_MULTIMODAL_ENDPOINT = "/api/v1/services/aigc/multimodal-generation/generation";
const NATIVE_LEGACY_TEXT2IMAGE_ENDPOINT = "/api/v1/services/aigc/text2image/image-synthesis";

type DashscopeAuthInfo = {
  apiKey: string;
  source: string;
};

type GeneratedImage = {
  buffer: Buffer;
  mimeType: string;
  source: "b64_json" | "url";
  sourceUrl?: string;
  requestId?: string;
};

type NativeTaskPayload = {
  taskId: string;
  requestId?: string;
};

type ImageSize = {
  openaiSize: string;
  nativeSize: string;
};

type RequestedImageModel = {
  providerId: string;
  modelId: string;
};

type ImageProviderAdapter = {
  providerId: string;
  defaultModel: string;
  resolveBaseUrl: (cfg: OpenClawConfig) => string;
  resolveAuth: (params: { cfg: OpenClawConfig; agentDir?: string }) => Promise<DashscopeAuthInfo>;
  generate: (params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
    size: ImageSize;
    runtime: OpenClawPluginApi["runtime"];
  }) => Promise<GeneratedImage>;
};

type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseAgentSessionKeySafe(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "agent") {
    return null;
  }
  const agentId = parts[1]?.trim();
  const rest = parts.slice(2).join(":").trim();
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_DASHSCOPE_BASE_URL;
  }
  return trimmed.replace(/\/+$/, "");
}

function resolveDashscopeBaseUrl(cfg: OpenClawConfig): string {
  const configured = cfg.models?.providers?.[DASHSCOPE_PROVIDER_ID]?.baseUrl;
  return normalizeBaseUrl(configured);
}

function parseProviderModel(model: string): RequestedImageModel | null {
  const trimmed = model.trim();
  if (!trimmed || !trimmed.includes("/")) {
    return null;
  }
  const [providerRaw, ...rest] = trimmed.split("/");
  const providerId = normalizeProvider(providerRaw || "");
  const modelId = rest.join("/").trim();
  if (!providerId || !modelId) {
    return null;
  }
  return { providerId, modelId };
}

function resolveRequestedImageModel(params: {
  cfg: OpenClawConfig;
  rawModel?: string;
  rawProvider?: string;
}): RequestedImageModel {
  const explicitProvider = normalizeProvider(params.rawProvider?.trim() || "");
  const providerHint = explicitProvider;

  const requested = params.rawModel?.trim();
  if (requested) {
    const parsed = parseProviderModel(requested);
    if (parsed) {
      return parsed;
    }
    return {
      providerId: providerHint || DEFAULT_IMAGE_PROVIDER,
      modelId: requested,
    };
  }

  const imagePrimary = params.cfg.agents?.defaults?.imageModel?.primary?.trim() || "";
  const parsedPrimary = imagePrimary ? parseProviderModel(imagePrimary) : null;
  if (parsedPrimary) {
    return parsedPrimary;
  }
  if (imagePrimary) {
    return {
      providerId: providerHint || DEFAULT_IMAGE_PROVIDER,
      modelId: imagePrimary,
    };
  }

  return {
    providerId: providerHint || DEFAULT_IMAGE_PROVIDER,
    modelId: DEFAULT_IMAGE_MODEL,
  };
}

function normalizeImageSize(rawSize: string | undefined): {
  openaiSize: string;
  nativeSize: string;
} {
  const fallback = { openaiSize: DEFAULT_IMAGE_SIZE, nativeSize: "1024*1024" };
  const value = rawSize?.trim();
  if (!value) {
    return fallback;
  }
  const match = /^(\d{2,5})\s*[xX*]\s*(\d{2,5})$/.exec(value);
  if (!match) {
    return fallback;
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return {
    openaiSize: `${width}x${height}`,
    nativeSize: `${width}*${height}`,
  };
}

async function resolveDashscopeApiKeyFromAuthStore(
  agentDir: string | undefined,
): Promise<DashscopeAuthInfo | null> {
  const trimmedAgentDir = agentDir?.trim();
  if (!trimmedAgentDir) {
    return null;
  }
  const authPath = path.join(trimmedAgentDir, "auth-profiles.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(authPath, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.profiles)) {
    return null;
  }

  const profiles = parsed.profiles as Record<string, unknown>;
  const candidateIds: string[] = [];
  if (isRecord(parsed.order)) {
    const dashscopeOrder = parsed.order[DASHSCOPE_PROVIDER_ID];
    if (Array.isArray(dashscopeOrder)) {
      for (const entry of dashscopeOrder) {
        if (typeof entry === "string" && entry.trim()) {
          candidateIds.push(entry.trim());
        }
      }
    }
  }
  candidateIds.push(`${DASHSCOPE_PROVIDER_ID}:default`);
  for (const [profileId, rawProfile] of Object.entries(profiles)) {
    if (!isRecord(rawProfile)) {
      continue;
    }
    const provider = typeof rawProfile.provider === "string" ? rawProfile.provider.trim() : "";
    if (normalizeProvider(provider) === DASHSCOPE_PROVIDER_ID) {
      candidateIds.push(profileId);
    }
  }

  const seen = new Set<string>();
  for (const profileId of candidateIds) {
    if (seen.has(profileId)) {
      continue;
    }
    seen.add(profileId);
    const rawProfile = profiles[profileId];
    if (!isRecord(rawProfile)) {
      continue;
    }
    const provider = typeof rawProfile.provider === "string" ? rawProfile.provider.trim() : "";
    if (normalizeProvider(provider) !== DASHSCOPE_PROVIDER_ID) {
      continue;
    }
    const type = typeof rawProfile.type === "string" ? rawProfile.type.trim() : "";
    const token =
      type === "token" && typeof rawProfile.token === "string"
        ? rawProfile.token.trim()
        : type === "api_key" && typeof rawProfile.key === "string"
          ? rawProfile.key.trim()
          : type === "oauth" && typeof rawProfile.access === "string"
            ? rawProfile.access.trim()
            : "";
    if (!token) {
      continue;
    }
    return {
      apiKey: token,
      source: `auth-profiles:${profileId}`,
    };
  }

  return null;
}

async function resolveDashscopeApiKey(params: {
  cfg: OpenClawConfig;
  agentDir?: string;
}): Promise<DashscopeAuthInfo> {
  const envKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, source: "env:DASHSCOPE_API_KEY" };
  }

  const providerCfg = params.cfg.models?.providers?.[DASHSCOPE_PROVIDER_ID];
  const cfgKey = providerCfg?.apiKey?.trim();
  if (cfgKey) {
    return { apiKey: cfgKey, source: "models.providers.dashscope.apiKey" };
  }

  const storeResolved = await resolveDashscopeApiKeyFromAuthStore(params.agentDir);
  if (storeResolved) {
    return storeResolved;
  }

  throw new Error(
    "DashScope API key not found. Set DASHSCOPE_API_KEY, or configure dashscope auth profile.",
  );
}

function stripThreadTokens(tokens: string[]): string[] {
  const lower = tokens.map((token) => token.toLowerCase());
  const threadIdx = lower.findIndex((token) => token === "thread" || token === "topic");
  if (threadIdx <= 0) {
    return tokens;
  }
  return tokens.slice(0, threadIdx);
}

function inferTargetFromSession(params: { sessionKey?: string; accountId: string }): string | null {
  const parsed = parseAgentSessionKeySafe(params.sessionKey);
  if (!parsed) {
    return null;
  }
  let tokens = stripThreadTokens(
    parsed.rest
      .split(":")
      .map((token) => token.trim())
      .filter(Boolean),
  );
  if (tokens.length === 0) {
    return null;
  }
  if (tokens[0]?.toLowerCase() === "proluofire-im") {
    tokens = tokens.slice(1);
  }
  if (tokens.length === 0) {
    return null;
  }

  const lower = tokens.map((token) => token.toLowerCase());
  const directIndex = lower.lastIndexOf("direct");
  if (directIndex >= 0 && tokens[directIndex + 1]) {
    const userId = tokens[directIndex + 1];
    const mappedRoom = resolveDirectRoomForTarget({
      accountId: params.accountId,
      target: `@${userId}`,
    });
    return mappedRoom ? `#${mappedRoom}` : `@${userId}`;
  }

  const groupIndex = Math.max(lower.lastIndexOf("group"), lower.lastIndexOf("channel"));
  if (groupIndex >= 0 && tokens[groupIndex + 1]) {
    return `#${tokens[groupIndex + 1]}`;
  }

  return null;
}

async function parseErrorBody(response: Response): Promise<string> {
  const text = (await response.text().catch(() => "")).trim();
  if (!text) {
    return response.statusText;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      return text;
    }
    const message =
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (isRecord(parsed.error) &&
      typeof parsed.error.message === "string" &&
      parsed.error.message.trim()
        ? parsed.error.message.trim()
        : "");
    return message || text;
  } catch {
    return text;
  }
}

function pickFirstImageSource(payload: unknown): {
  base64?: string;
  url?: string;
  mimeType?: string;
  taskId?: string;
} {
  if (!isRecord(payload)) {
    return {};
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  if (data.length > 0 && isRecord(data[0])) {
    const first = data[0];
    const b64 =
      (typeof first.b64_json === "string" && first.b64_json.trim()) ||
      (typeof first.base64 === "string" && first.base64.trim()) ||
      (typeof first.image_base64 === "string" && first.image_base64.trim()) ||
      "";
    const url =
      (typeof first.url === "string" && first.url.trim()) ||
      (typeof first.image_url === "string" && first.image_url.trim()) ||
      "";
    const mimeType =
      (typeof first.mime_type === "string" && first.mime_type.trim()) ||
      (typeof first.mimeType === "string" && first.mimeType.trim()) ||
      undefined;
    if (b64 || url) {
      return {
        ...(b64 ? { base64: b64 } : {}),
        ...(url ? { url } : {}),
        ...(mimeType ? { mimeType } : {}),
      };
    }
  }

  const output = isRecord(payload.output) ? payload.output : null;
  const choices = output && Array.isArray(output.choices) ? output.choices : [];
  if (choices.length > 0 && isRecord(choices[0])) {
    const firstChoice = choices[0];
    const message = isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message && Array.isArray(message.content) ? message.content : [];
    if (content.length > 0 && isRecord(content[0])) {
      const first = content[0];
      const url =
        (typeof first.image === "string" && first.image.trim()) ||
        (typeof first.image_url === "string" && first.image_url.trim()) ||
        (typeof first.url === "string" && first.url.trim()) ||
        "";
      const b64 =
        (typeof first.base64 === "string" && first.base64.trim()) ||
        (typeof first.b64_json === "string" && first.b64_json.trim()) ||
        "";
      const mimeType =
        (typeof first.mime_type === "string" && first.mime_type.trim()) ||
        (typeof first.mimeType === "string" && first.mimeType.trim()) ||
        undefined;
      if (url || b64) {
        return {
          ...(url ? { url } : {}),
          ...(b64 ? { base64: b64 } : {}),
          ...(mimeType ? { mimeType } : {}),
        };
      }
    }
  }

  const images = output && Array.isArray(output.images) ? output.images : [];
  if (images.length > 0) {
    const first = images[0];
    if (typeof first === "string" && first.trim()) {
      return { url: first.trim() };
    }
    if (isRecord(first)) {
      const url =
        (typeof first.url === "string" && first.url.trim()) ||
        (typeof first.image === "string" && first.image.trim()) ||
        "";
      const b64 =
        (typeof first.base64 === "string" && first.base64.trim()) ||
        (typeof first.b64_json === "string" && first.b64_json.trim()) ||
        "";
      if (url || b64) {
        return {
          ...(url ? { url } : {}),
          ...(b64 ? { base64: b64 } : {}),
        };
      }
    }
  }

  if (output && typeof output.task_id === "string" && output.task_id.trim()) {
    return { taskId: output.task_id.trim() };
  }

  const results = output && Array.isArray(output.results) ? output.results : [];
  if (results.length > 0 && isRecord(results[0])) {
    const first = results[0];
    const url =
      (typeof first.url === "string" && first.url.trim()) ||
      (typeof first.image_url === "string" && first.image_url.trim()) ||
      "";
    const b64 =
      (typeof first.base64 === "string" && first.base64.trim()) ||
      (typeof first.image_base64 === "string" && first.image_base64.trim()) ||
      "";
    const mimeType =
      (typeof first.mime_type === "string" && first.mime_type.trim()) ||
      (typeof first.mimeType === "string" && first.mimeType.trim()) ||
      undefined;
    if (url || b64) {
      return {
        ...(url ? { url } : {}),
        ...(b64 ? { base64: b64 } : {}),
        ...(mimeType ? { mimeType } : {}),
      };
    }
  }

  return {};
}

async function resolveGeneratedImageFromSource(params: {
  source: { base64?: string; url?: string; mimeType?: string };
  runtime: OpenClawPluginApi["runtime"];
  requestId?: string;
}): Promise<GeneratedImage> {
  const { source, runtime, requestId } = params;
  if (source.base64) {
    const cleaned = source.base64.trim();
    const buffer = Buffer.from(cleaned, "base64");
    if (buffer.length === 0) {
      throw new Error("Image payload is empty.");
    }
    return {
      buffer,
      mimeType: source.mimeType?.trim() || "image/png",
      source: "b64_json",
      requestId,
    };
  }
  if (!source.url) {
    throw new Error("DashScope did not return an image URL or base64 payload.");
  }
  const media = await runtime.media.loadWebMedia(source.url, DEFAULT_MAX_IMAGE_BYTES);
  return {
    buffer: Buffer.from(media.buffer),
    mimeType: media.contentType || source.mimeType?.trim() || "image/png",
    source: "url",
    sourceUrl: source.url,
    requestId,
  };
}

async function generateViaOpenAiCompatible(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  runtime: OpenClawPluginApi["runtime"];
}): Promise<GeneratedImage> {
  const response = await fetch(`${params.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(`openai-compatible endpoint failed (${response.status}): ${detail}`);
  }

  const requestId = response.headers.get("x-request-id") || undefined;
  const payload = (await response.json().catch(() => ({}))) as unknown;
  const parsed = pickFirstImageSource(payload);
  if (!parsed.base64 && !parsed.url) {
    throw new Error("openai-compatible endpoint returned no image payload.");
  }
  return resolveGeneratedImageFromSource({
    source: parsed,
    runtime: params.runtime,
    requestId,
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTaskStatus(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }
  const output = isRecord(payload.output) ? payload.output : null;
  const candidates = [
    output && typeof output.task_status === "string" ? output.task_status : "",
    output && typeof output.status === "string" ? output.status : "",
    typeof payload.task_status === "string" ? payload.task_status : "",
    typeof payload.status === "string" ? payload.status : "",
  ];
  return (
    candidates
      .find((value) => value.trim())
      ?.trim()
      .toUpperCase() || ""
  );
}

async function pollNativeTask(params: {
  origin: string;
  apiKey: string;
  taskId: string;
  runtime: OpenClawPluginApi["runtime"];
  timeoutMs: number;
  intervalMs: number;
  requestId?: string;
}): Promise<GeneratedImage> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= params.timeoutMs) {
    const response = await fetch(`${params.origin}/api/v1/tasks/${params.taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`native task query failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json().catch(() => ({}))) as unknown;
    const status = resolveTaskStatus(payload);
    if (status === "SUCCEEDED" || status === "SUCCESS" || status === "COMPLETED") {
      const parsed = pickFirstImageSource(payload);
      if (!parsed.base64 && !parsed.url) {
        throw new Error("native task succeeded but returned no image payload.");
      }
      return resolveGeneratedImageFromSource({
        source: parsed,
        runtime: params.runtime,
        requestId: params.requestId,
      });
    }
    if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
      throw new Error(`native task failed with status: ${status}`);
    }
    await sleep(params.intervalMs);
  }
  throw new Error("native task polling timed out");
}

async function generateViaNativeMultimodal(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  nativeSize: string;
  runtime: OpenClawPluginApi["runtime"];
}): Promise<GeneratedImage> {
  const origin = new URL(params.baseUrl).origin;
  const response = await fetch(`${origin}${NATIVE_MULTIMODAL_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: params.prompt }],
          },
        ],
      },
      parameters: {
        size: params.nativeSize,
      },
    }),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(`native multimodal endpoint failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json().catch(() => ({}))) as unknown;
  const responseRequestId = response.headers.get("x-request-id") || undefined;
  const payloadRequestId =
    isRecord(payload) && typeof payload.request_id === "string" && payload.request_id.trim()
      ? payload.request_id.trim()
      : undefined;
  const requestId = responseRequestId ?? payloadRequestId;
  const parsed = pickFirstImageSource(payload);
  if (!parsed.base64 && !parsed.url) {
    throw new Error("native multimodal endpoint returned no image payload.");
  }
  return resolveGeneratedImageFromSource({
    source: parsed,
    runtime: params.runtime,
    requestId,
  });
}

function isLegacyText2ImageModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "qwen-image" || normalized.startsWith("qwen-image-plus");
}

async function generateViaNativeLegacyText2Image(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  nativeSize: string;
  runtime: OpenClawPluginApi["runtime"];
}): Promise<GeneratedImage> {
  const origin = new URL(params.baseUrl).origin;
  const response = await fetch(`${origin}${NATIVE_LEGACY_TEXT2IMAGE_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: params.model,
      input: {
        prompt: params.prompt,
      },
      parameters: {
        size: params.nativeSize,
      },
    }),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(`native endpoint failed (${response.status}): ${detail}`);
  }

  const requestId = response.headers.get("x-request-id") || undefined;
  const payload = (await response.json().catch(() => ({}))) as unknown;
  const parsed = pickFirstImageSource(payload);
  if (parsed.base64 || parsed.url) {
    return resolveGeneratedImageFromSource({
      source: parsed,
      runtime: params.runtime,
      requestId,
    });
  }
  const task = parsed.taskId
    ? ({ taskId: parsed.taskId, requestId } satisfies NativeTaskPayload)
    : null;
  if (!task) {
    throw new Error("native endpoint returned no image payload or task id.");
  }
  return pollNativeTask({
    origin,
    apiKey: params.apiKey,
    taskId: task.taskId,
    runtime: params.runtime,
    timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
    requestId: task.requestId,
  });
}

async function generateDashscopeImage(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: { openaiSize: string; nativeSize: string };
  runtime: OpenClawPluginApi["runtime"];
}): Promise<GeneratedImage> {
  let nativeMultimodalError = "";
  try {
    return await generateViaNativeMultimodal({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
      prompt: params.prompt,
      nativeSize: params.size.nativeSize,
      runtime: params.runtime,
    });
  } catch (error) {
    nativeMultimodalError = error instanceof Error ? error.message : String(error);
  }

  let legacyError = "";
  if (isLegacyText2ImageModel(params.model)) {
    try {
      return await generateViaNativeLegacyText2Image({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        nativeSize: params.size.nativeSize,
        runtime: params.runtime,
      });
    } catch (error) {
      legacyError = error instanceof Error ? error.message : String(error);
    }
  }

  let openAiError = "";
  try {
    return await generateViaOpenAiCompatible({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
      prompt: params.prompt,
      size: params.size.openaiSize,
      runtime: params.runtime,
    });
  } catch (error) {
    openAiError = error instanceof Error ? error.message : String(error);
    const legacySection = legacyError ? `; legacy-text2image=${legacyError}` : "";
    throw new Error(
      `DashScope image generation failed. native-multimodal=${nativeMultimodalError}${legacySection}; openai-compatible=${openAiError}`,
    );
  }
}

const DASHSCOPE_IMAGE_ADAPTER: ImageProviderAdapter = {
  providerId: DASHSCOPE_PROVIDER_ID,
  defaultModel: DEFAULT_IMAGE_MODEL,
  resolveBaseUrl: resolveDashscopeBaseUrl,
  resolveAuth: resolveDashscopeApiKey,
  generate: generateDashscopeImage,
};

const IMAGE_PROVIDER_ADAPTERS: Record<string, ImageProviderAdapter> = {
  [DASHSCOPE_PROVIDER_ID]: DASHSCOPE_IMAGE_ADAPTER,
};

async function persistImageToLocal(params: {
  workspaceDir?: string;
  providerId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const workspace = params.workspaceDir?.trim();
  const folder = params.providerId.trim() || "images";
  const root = workspace
    ? path.join(workspace, "generated", folder)
    : path.join(os.tmpdir(), "openclaw-generated", folder);
  await fs.mkdir(root, { recursive: true });
  const ext = extensionForMime(params.mimeType) || ".png";
  const fileName = `${folder}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}${ext}`;
  const outputPath = path.join(root, fileName);
  await fs.writeFile(outputPath, params.buffer);
  return outputPath;
}

function resolveSendTarget(params: {
  explicitTarget?: string;
  sessionKey?: string;
  accountId: string;
}): string {
  const explicit = params.explicitTarget?.trim();
  if (explicit) {
    return explicit;
  }
  const inferred = inferTargetFromSession({
    sessionKey: params.sessionKey,
    accountId: params.accountId,
  });
  if (inferred) {
    return inferred;
  }
  throw new Error(
    "Unable to infer current proluofire-im target from session. Please provide target explicitly.",
  );
}

type CreateImageToolOptions = {
  toolName: string;
  label: string;
  description: string;
};

function createProluofireImageTool(
  api: OpenClawPluginApi,
  context: OpenClawPluginToolContext,
  options: CreateImageToolOptions,
) {
  if (context.messageChannel && context.messageChannel !== "proluofire-im") {
    return null;
  }

  return {
    name: options.toolName,
    label: options.label,
    description: options.description,
    parameters: Type.Object({
      prompt: Type.String({ description: "Image generation prompt." }),
      caption: Type.Optional(
        Type.String({ description: "Optional caption to send with the image." }),
      ),
      provider: Type.Optional(
        Type.String({
          description:
            "Image provider id, e.g. dashscope. If omitted, inferred from model or defaults.",
        }),
      ),
      size: Type.Optional(
        Type.String({
          description: "Image size, e.g. 1024x1024, 768x1344.",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Image model id or provider/model. Defaults to agents.defaults.imageModel.primary.",
        }),
      ),
      target: Type.Optional(
        Type.String({
          description:
            "Optional proluofire-im target override (#roomId or @userId). Defaults to current session route.",
        }),
      ),
    }),
    async execute(_toolCallId: string, args: Record<string, unknown>) {
      const prompt = readStringParam(args, "prompt", { required: true, label: "prompt" });
      const caption = readStringParam(args, "caption", { allowEmpty: true }) ?? "";
      const size = normalizeImageSize(readStringParam(args, "size"));
      const rawProvider = readStringParam(args, "provider");
      const rawModel = readStringParam(args, "model");
      const explicitTarget = readStringParam(args, "target");

      const cfg = api.config as OpenClawConfig;
      const accountId = context.agentAccountId?.trim() || DEFAULT_ACCOUNT_ID;
      const target = resolveSendTarget({
        explicitTarget,
        sessionKey: context.sessionKey,
        accountId,
      });

      const requested = resolveRequestedImageModel({
        cfg,
        rawModel,
        rawProvider,
      });
      const adapter = IMAGE_PROVIDER_ADAPTERS[requested.providerId];
      if (!adapter) {
        const supported = Object.keys(IMAGE_PROVIDER_ADAPTERS).join(", ");
        throw new Error(
          `Unsupported image provider: ${requested.providerId}. Supported providers: ${supported}`,
        );
      }

      const baseUrl = adapter.resolveBaseUrl(cfg);
      const auth = await adapter.resolveAuth({
        cfg,
        agentDir: context.agentDir,
      });
      const generated = await adapter.generate({
        baseUrl,
        apiKey: auth.apiKey,
        model: requested.modelId,
        prompt,
        size,
        runtime: api.runtime,
      });

      const localPath = await persistImageToLocal({
        workspaceDir: context.workspaceDir,
        providerId: requested.providerId,
        buffer: generated.buffer,
        mimeType: generated.mimeType,
      });

      const sendResult = await sendMessageWithMedia(
        target,
        caption,
        [{ path: localPath, type: generated.mimeType }],
        {
          cfg: cfg as CoreConfig,
          accountId,
        },
      );

      return jsonResult({
        ok: true,
        provider: requested.providerId,
        model: `${requested.providerId}/${requested.modelId}`,
        target: sendResult.to,
        messageId: sendResult.messageId,
        localPath,
        source: generated.source,
        ...(generated.sourceUrl ? { sourceUrl: generated.sourceUrl } : {}),
        ...(generated.requestId ? { requestId: generated.requestId } : {}),
        authSource: auth.source,
      });
    },
  };
}

export function createProluofireImageGenerateTool(
  api: OpenClawPluginApi,
  context: OpenClawPluginToolContext,
) {
  return createProluofireImageTool(api, context, {
    toolName: "proluofire_image_generate",
    label: "Proluofire Image Generate",
    description:
      "Generate an image with configured providers and send it back to the current proluofire-im room automatically.",
  });
}

export const __testing = {
  inferTargetFromSession,
  resolveRequestedImageModel,
  normalizeImageSize,
  pickFirstImageSource,
  resolveDashscopeApiKeyFromAuthStore,
};
