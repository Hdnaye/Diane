import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  REVIEW_RESOLVED_RETENTION_DAYS,
  REVIEW_MAX_RETENTION_DAYS,
  INBOUND_RETENTION_DAYS,
  purgeCutoffs,
} =
  require("../../pb_hooks/lib/retention.cjs") as typeof import("../../pb_hooks/lib/retention.cjs");

describe("purgeCutoffs", () => {
  it("keeps resolved SMS 30 days, any queued SMS 90 days, webhook ids 7 days", () => {
    expect([
      REVIEW_RESOLVED_RETENTION_DAYS,
      REVIEW_MAX_RETENTION_DAYS,
      INBOUND_RETENTION_DAYS,
    ]).toStrictEqual([30, 90, 7]);
    expect(purgeCutoffs(new Date("2026-11-08T03:17:00.000Z"))).toStrictEqual({
      resolvedBefore: "2026-10-09 03:17:00.000Z",
      queuedBefore: "2026-08-10 03:17:00.000Z",
      inboundBefore: "2026-11-01 03:17:00.000Z",
    });
  });
});
