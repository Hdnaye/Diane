import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  POCKETBASE_VERSION,
  assertSha256,
  resolveAsset,
} from "../../scripts/pocketbase-release.js";

describe("resolveAsset", () => {
  it("pins an exact PocketBase version", () => {
    expect(POCKETBASE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("resolves the linux amd64 archive on x64 machines", () => {
    const asset = resolveAsset("linux", "x64");

    expect(asset.name).toBe(`pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip`);
    expect(asset.url).toBe(
      `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/${asset.name}`,
    );
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves the linux arm64 archive on a 64-bit Raspberry Pi", () => {
    const asset = resolveAsset("linux", "arm64");

    expect(asset.name).toBe(`pocketbase_${POCKETBASE_VERSION}_linux_arm64.zip`);
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.sha256).not.toBe(resolveAsset("linux", "x64").sha256);
  });

  it.each([
    ["darwin", "arm64"],
    ["win32", "x64"],
    ["linux", "arm"],
    ["linux", "ia32"],
  ])("rejects unsupported platform %s/%s", (platform, arch) => {
    expect(() => resolveAsset(platform, arch)).toThrow(/unsupported/i);
  });
});

describe("assertSha256", () => {
  const data = new TextEncoder().encode("pocketbase");
  const digest = createHash("sha256").update(data).digest("hex");

  it("accepts data matching the expected checksum", () => {
    expect(() => assertSha256(data, digest)).not.toThrow();
  });

  it("rejects data not matching the expected checksum", () => {
    expect(() => assertSha256(data, "0".repeat(64))).toThrow(/checksum/i);
  });
});
