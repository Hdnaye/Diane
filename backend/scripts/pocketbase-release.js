import { createHash } from "node:crypto";

/**
 * Pinned PocketBase version. PocketBase is pre-1.0 and may ship breaking
 * changes between minor versions: bump deliberately, together with the
 * checksums below (from the release's checksums.txt).
 *
 * 0.40.6 is the last release published on GitHub: later versions will need
 * a new download URL (see `resolveAsset`).
 */
export const POCKETBASE_VERSION = "0.40.6";

/** SHA-256 of each supported release archive, keyed by Node `platform/arch`. */
const ARCHIVES = {
  "linux/x64": {
    target: "linux_amd64",
    sha256: "0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f",
  },
  "linux/arm64": {
    target: "linux_arm64",
    sha256: "d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f",
  },
};

/**
 * @typedef {object} ReleaseAsset
 * @property {string} name   Archive file name.
 * @property {string} url    Official GitHub download URL.
 * @property {string} sha256 Expected SHA-256 (hex) of the archive.
 */

/**
 * Returns the PocketBase archive to download for a given machine.
 *
 * @param {string} platform Node `process.platform`.
 * @param {string} arch     Node `process.arch`.
 * @returns {ReleaseAsset}
 */
export function resolveAsset(platform, arch) {
  const key = `${platform}/${arch}`;
  const archive = ARCHIVES[/** @type {keyof typeof ARCHIVES} */ (key)];
  if (!archive) {
    throw new Error(
      `Unsupported platform ${key}: supported are ${Object.keys(ARCHIVES).join(", ")} (use a 64-bit OS on the Raspberry Pi).`,
    );
  }
  const name = `pocketbase_${POCKETBASE_VERSION}_${archive.target}.zip`;
  return {
    name,
    url: `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/${name}`,
    sha256: archive.sha256,
  };
}

/**
 * Throws if `data` does not hash to `expectedSha256`.
 *
 * @param {Uint8Array} data
 * @param {string} expectedSha256 Hex-encoded SHA-256.
 */
export function assertSha256(data, expectedSha256) {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `Checksum mismatch: expected ${expectedSha256}, got ${actual}.`,
    );
  }
}
