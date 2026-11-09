// Dedicated PocketBase instances for tests that need their own environment
// (transports, public URL), exact counts over every member, or the process
// output. The shared instance (pocketbase.global-setup.ts) is used through
// api.ts.
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiResponse, RequestOptions } from "./api.js";
import {
  startPocketBase,
  type PocketBaseProcess,
} from "./pocketbase-process.js";

/** Public URL of the answer links in tests (fictitious). */
export const TEST_PUBLIC_URL = "https://diane.example.org";

export interface OutboxMessage {
  kind: "sms" | "email";
  to: string;
  text: string;
  subject?: string;
  /** Message id given to the SMS gateway (duplicates rejected). */
  id?: string;
}

export interface TestInstance {
  process: PocketBaseProcess;
  api(pathname: string, options?: RequestOptions): Promise<ApiResponse>;
  superuserToken: string;
  /** Auth token of an organizer account of this instance. */
  organizerToken: string;
  /** Messages recorded by the fake transports, in no particular order. */
  outbox(): Promise<OutboxMessage[]>;
  /** Stops PocketBase and starts it again on the same data (new port). */
  restart(): Promise<void>;
  stop(): Promise<void>;
}

/** Calls the API of the instance at `url`. */
export async function callApi(
  url: string,
  pathname: string,
  { method = "GET", token, body }: RequestOptions = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${url}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/**
 * PocketBase's rate limiter counts requests per IP: tests all come from
 * 127.0.0.1 and would be throttled. Exempts it (settings of this instance
 * only; rate-limit.test.ts checks the limits themselves).
 */
export async function exemptLocalhostFromRateLimits(
  url: string,
  superuserToken: string,
): Promise<void> {
  const response = await callApi(url, "/api/settings", {
    method: "PATCH",
    token: superuserToken,
    body: { rateLimits: { excludedIPs: ["127.0.0.1", "::1"] } },
  });
  if (response.status !== 200) {
    throw new Error(`Rate limit exemption failed: HTTP ${response.status}`);
  }
}

export interface TestInstanceOptions {
  /** Environment of PocketBase, on top of the fake transports. */
  env?: NodeJS.ProcessEnv;
  /** Keep PocketBase's rate limits for 127.0.0.1 (default: exempted). */
  rateLimited?: boolean;
}

/**
 * Starts an instance with fake transports writing to a temporary outbox,
 * answer links on TEST_PUBLIC_URL, a superuser and an organizer.
 */
export async function startTestInstance({
  env = {},
  rateLimited = false,
}: TestInstanceOptions = {}): Promise<TestInstance> {
  const outboxDir = await mkdtemp(path.join(tmpdir(), "diane-outbox-"));
  const dataDir = await mkdtemp(path.join(tmpdir(), "diane-pb-test-"));
  const superuser = {
    email: "superuser@diane.test",
    password: randomBytes(16).toString("hex"),
  };
  const pocketbaseEnv = {
    DIANE_PUBLIC_URL: TEST_PUBLIC_URL,
    DIANE_SMS_TRANSPORT: "fake",
    DIANE_EMAIL_TRANSPORT: "fake",
    DIANE_FAKE_OUTBOX_DIR: outboxDir,
    DIANE_SMS_GATEWAY_URL: "",
    DIANE_SMS_GATEWAY_USERNAME: "",
    DIANE_SMS_GATEWAY_PASSWORD: "",
    DIANE_SMS_GATEWAY_PHONE: "",
    DIANE_SMS_WEBHOOK_SECRET: "",
    DIANE_REMINDER_SCHEDULE: "",
    DIANE_EMAIL_SENDER_ADDRESS: "",
    DIANE_EMAIL_SENDER_NAME: "",
    ...env,
  };
  let process = await startPocketBase({
    superuser,
    dataDir,
    env: pocketbaseEnv,
  });
  const cleanUp = async () => {
    await process.stop();
    await rm(outboxDir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  };
  const api = (pathname: string, options?: RequestOptions) =>
    callApi(process.url, pathname, options);

  const login = async (
    collection: string,
    identity: string,
    password: string,
  ) => {
    const response = await api(
      `/api/collections/${collection}/auth-with-password`,
      { method: "POST", body: { identity, password } },
    );
    if (response.status !== 200) {
      throw new Error(`${collection} auth failed: HTTP ${response.status}`);
    }
    return response.body.token as string;
  };

  try {
    const superuserToken = await login(
      "_superusers",
      superuser.email,
      superuser.password,
    );
    if (!rateLimited) {
      await exemptLocalhostFromRateLimits(process.url, superuserToken);
    }
    const organizer = {
      email: `organizer-${randomBytes(6).toString("hex")}@example.com`,
      password: randomBytes(32).toString("hex"),
    };
    const created = await api("/api/collections/organizers/records", {
      method: "POST",
      token: superuserToken,
      body: { ...organizer, passwordConfirm: organizer.password },
    });
    if (created.status !== 200) {
      throw new Error(`Organizer creation failed: HTTP ${created.status}`);
    }
    const organizerToken = await login(
      "organizers",
      organizer.email,
      organizer.password,
    );

    return {
      get process() {
        return process;
      },
      api,
      superuserToken,
      organizerToken,
      async outbox() {
        const files = await readdir(outboxDir);
        return Promise.all(
          files.map(async (file) => ({
            kind: file.startsWith("sms-") ? "sms" : "email",
            ...JSON.parse(await readFile(path.join(outboxDir, file), "utf8")),
          })),
        );
      },
      async restart() {
        await process.stop();
        process = await startPocketBase({ dataDir, env: pocketbaseEnv });
      },
      stop: cleanUp,
    };
  } catch (error) {
    await cleanUp();
    throw error;
  }
}
