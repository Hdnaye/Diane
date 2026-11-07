// The app's record types are generated from the migrations
// (`npm run typegen`): fail when the committed file is out of date.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_TYPES_FILE, generateTypes } from "../../scripts/typegen.js";

describe("app/src/lib/pocketbase-types.ts", () => {
  let tempDir: string;
  let generated: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "diane-typegen-"));
    const outFile = path.join(tempDir, "pocketbase-types.ts");
    await generateTypes(outFile);
    generated = await readFile(outFile, "utf8");
  }, 60_000);

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("says it is generated and must not be edited by hand", () => {
    expect(generated.split("\n").slice(0, 5).join("\n")).toMatch(
      /ne pas modifier à la main[\s\S]*npm run typegen/,
    );
  });

  it("types every Diane collection", () => {
    for (const type of [
      "OrganizersRecord",
      "MembersRecord",
      "HuntsRecord",
      "InvitationsRecord",
      "MessageTemplatesRecord",
      "SmsReviewQueueRecord",
    ]) {
      expect(generated).toContain(`export type ${type} = {`);
    }
  });

  it("is up to date with the migrations (otherwise run `npm run typegen`)", async () => {
    expect(await readFile(APP_TYPES_FILE, "utf8")).toBe(generated);
  });
});
