import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __testing } from "./dashscope-image-tool.js";
import { bindDirectRoomForUser } from "./runtime.js";

describe("proluofire dashscope image tool helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("infers direct target and maps to bound room id", () => {
    bindDirectRoomForUser({
      accountId: "default",
      userId: "288248435394478080",
      roomId: "288261778784124928",
    });
    const target = __testing.inferTargetFromSession({
      sessionKey: "agent:main:proluofire-im:direct:288248435394478080",
      accountId: "default",
    });
    expect(target).toBe("#288261778784124928");
  });

  it("infers group target from session key", () => {
    const target = __testing.inferTargetFromSession({
      sessionKey: "agent:main:proluofire-im:group:9527",
      accountId: "default",
    });
    expect(target).toBe("#9527");
  });

  it("falls back to user target when direct mapping is missing", () => {
    const target = __testing.inferTargetFromSession({
      sessionKey: "agent:main:proluofire-im:direct:10086",
      accountId: "work",
    });
    expect(target).toBe("@10086");
  });

  it("normalizes image size formats", () => {
    expect(__testing.normalizeImageSize("768*1344")).toEqual({
      openaiSize: "768x1344",
      nativeSize: "768*1344",
    });
    expect(__testing.normalizeImageSize("1024x1024")).toEqual({
      openaiSize: "1024x1024",
      nativeSize: "1024*1024",
    });
    expect(__testing.normalizeImageSize("bad-size")).toEqual({
      openaiSize: "1024x1024",
      nativeSize: "1024*1024",
    });
  });

  it("parses multimodal response image url", () => {
    const parsed = __testing.pickFirstImageSource({
      output: {
        choices: [
          {
            message: {
              content: [
                {
                  image: "https://example.com/generated.png",
                },
              ],
            },
          },
        ],
      },
    });
    expect(parsed).toEqual({
      url: "https://example.com/generated.png",
    });
  });

  it("resolves provider and model from provider/model format", () => {
    const resolved = __testing.resolveRequestedImageModel({
      cfg: {} as never,
      rawModel: "dashscope/qwen-image-2.0",
    });
    expect(resolved).toEqual({
      providerId: "dashscope",
      modelId: "qwen-image-2.0",
    });
  });

  it("uses explicit provider when model has no provider prefix", () => {
    const resolved = __testing.resolveRequestedImageModel({
      cfg: {} as never,
      rawProvider: "dashscope",
      rawModel: "qwen-image-2.0",
    });
    expect(resolved).toEqual({
      providerId: "dashscope",
      modelId: "qwen-image-2.0",
    });
  });

  it("resolves dashscope key from auth profiles", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proluofire-dashscope-tool-"));
    tempDirs.push(dir);
    const authPath = path.join(dir, "auth-profiles.json");
    await fs.writeFile(
      authPath,
      JSON.stringify(
        {
          version: 2,
          profiles: {
            "dashscope:default": {
              type: "token",
              provider: "dashscope",
              token: "sk-default",
            },
            "dashscope:manual": {
              type: "token",
              provider: "dashscope",
              token: "sk-manual",
            },
          },
          order: {
            dashscope: ["dashscope:manual", "dashscope:default"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const resolved = await __testing.resolveDashscopeApiKeyFromAuthStore(dir);
    expect(resolved).toEqual({
      apiKey: "sk-manual",
      source: "auth-profiles:dashscope:manual",
    });
  });
});
