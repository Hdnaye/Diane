// Helpers for integration tests calling the PocketBase REST API of the
// throwaway instance started by pocketbase.global-setup.ts.
import { randomBytes } from "node:crypto";
import { inject } from "vitest";

export interface ApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON
  body: any;
}

export interface RequestOptions {
  method?: string;
  /** Auth token sent in the Authorization header; anonymous when omitted. */
  token?: string;
  body?: unknown;
}

/** Calls the test instance API, e.g. `api("/api/collections/members/records")`. */
export async function api(
  pathname: string,
  { method = "GET", token, body }: RequestOptions = {},
): Promise<ApiResponse> {
  const { url } = inject("pocketbase");
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

/** Random secret, like the organizer key generated for a real install. */
export function randomSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function authWithPassword(
  collection: string,
  identity: string,
  password: string,
): Promise<ApiResponse> {
  return api(`/api/collections/${collection}/auth-with-password`, {
    method: "POST",
    body: { identity, password },
  });
}

/** Auth token of the test superuser. */
export async function superuserToken(): Promise<string> {
  const { superuser } = inject("pocketbase");
  const response = await authWithPassword(
    "_superusers",
    superuser.email,
    superuser.password,
  );
  if (response.status !== 200) {
    throw new Error(`Superuser auth failed: HTTP ${response.status}`);
  }
  return response.body.token;
}

export interface Organizer {
  id: string;
  email: string;
  password: string;
  token: string;
}

/** Creates an organizer account with random credentials and logs it in. */
export async function createOrganizer(): Promise<Organizer> {
  const email = `organizer-${randomBytes(6).toString("hex")}@example.com`;
  const password = randomSecret();
  const created = await api("/api/collections/organizers/records", {
    method: "POST",
    token: await superuserToken(),
    body: { email, password, passwordConfirm: password },
  });
  if (created.status !== 200) {
    throw new Error(
      `Organizer creation failed: HTTP ${created.status} ${JSON.stringify(created.body)}`,
    );
  }
  const auth = await authWithPassword("organizers", email, password);
  if (auth.status !== 200) {
    throw new Error(`Organizer auth failed: HTTP ${auth.status}`);
  }
  return { id: created.body.id, email, password, token: auth.body.token };
}

/** `/api/collections/<name>/records[/<id>]` */
export function recordsPath(collection: string, id?: string): string {
  const base = `/api/collections/${collection}/records`;
  return id === undefined ? base : `${base}/${id}`;
}

/**
 * Fictitious phone numbers from the range reserved by ARCEP
 * (+33 6 39 98 xx xx). Each test file uses its own `block` (00-99) so that
 * numbers never collide on the shared test instance.
 */
export function phoneNumbers(block: number): () => string {
  let next = 0;
  return () => {
    if (next > 99) throw new Error(`Phone block ${block} exhausted`);
    const pair = (n: number) => String(n).padStart(2, "0");
    return `+3363998${pair(block)}${pair(next++)}`;
  };
}

/** Unique fictitious e-mail address. */
export function uniqueEmail(prefix = "member"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@example.com`;
}

/**
 * Distinct hunt days (YYYY-MM-DD). Each test file uses its own `year` so
 * that days never collide on the shared test instance (one hunt per day).
 */
export function huntDays(year: number): () => string {
  let next = 0;
  return () => {
    const day = new Date(Date.UTC(year, 0, 1 + next++));
    if (day.getUTCFullYear() !== year) throw new Error(`Year ${year} exhausted`);
    return day.toISOString().slice(0, 10);
  };
}
