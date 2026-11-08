import PocketBase, { BaseAuthStore, ClientResponseError, isTokenExpired } from 'pocketbase';

import type { ApiConfig } from '@/lib/api-config';
import { Collections } from '@/lib/pocketbase-types';

/**
 * A PocketBase client for the app. The token is kept in memory only (the app authenticates
 * again at each start), and identical requests running at the same time are not cancelled
 * (the SDK cancels them by default, which TanStack Query would see as errors).
 */
export function createPocketBaseClient(url: string): PocketBase {
  const pb = new PocketBase(url, new BaseAuthStore());
  pb.autoCancellation(false);
  return pb;
}

export type OrganizerSession = {
  /** Authenticates if needed (no token, or token about to expire). */
  connect(): Promise<void>;
  /** Runs a request once authenticated; on a 401, authenticates again and retries once. */
  run<T>(request: () => Promise<T>): Promise<T>;
};

type SessionOptions = {
  /** Attempts when the server limits authentications (429): 2 per 3 s for guests. */
  maxAttempts?: number;
  /** Wait between those attempts. */
  retryDelayMs?: number;
};

/** A token expiring within this delay is renewed before a request rather than sent. */
const TOKEN_RENEWAL_MARGIN_SECONDS = 60;

const hasStatus = (error: unknown, status: number) =>
  error instanceof ClientResponseError && error.status === status;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Silent authentication of the single organizer account (no login screen, see CLAUDE.md,
 * "Accès organisateur"): auth-with-password on `organizers` with the organizer's secret key.
 */
export function createOrganizerSession(
  pb: PocketBase,
  { organizerEmail, organizerKey }: Pick<ApiConfig, 'organizerEmail' | 'organizerKey'>,
  { maxAttempts = 4, retryDelayMs = 1500 }: SessionOptions = {}
): OrganizerSession {
  let pending: Promise<void> | null = null;

  async function authenticate() {
    for (let attempt = 1; ; attempt++) {
      try {
        await pb.collection(Collections.Organizers).authWithPassword(organizerEmail, organizerKey);
        return;
      } catch (error) {
        if (!hasStatus(error, 429) || attempt >= maxAttempts) {
          throw error;
        }
        await wait(retryDelayMs);
      }
    }
  }

  function connect() {
    if (pb.authStore.token && !isTokenExpired(pb.authStore.token, TOKEN_RENEWAL_MARGIN_SECONDS)) {
      return Promise.resolve();
    }
    // A single authentication at a time, however many callers (e.g. a double mount).
    pending ??= authenticate().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    connect,
    async run(request) {
      await connect();
      try {
        return await request();
      } catch (error) {
        if (!hasStatus(error, 401)) {
          throw error;
        }
        pb.authStore.clear();
        await connect();
        return request();
      }
    },
  };
}
