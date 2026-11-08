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

/** What a request gave: a result, or an error. */
export type Outcome<T> = { result: T } | { error: unknown };

export type RunOptions<T> = {
  /**
   * Tells if an outcome may come from a revoked token rather than from the data (an empty list,
   * a creation refused without reason): the server then checks the token, and if it was
   * revoked, the session authenticates again and the request is sent once more.
   */
  isDoubtful?: (outcome: Outcome<T>) => boolean;
};

export type OrganizerSession = {
  /**
   * Authenticates if needed (no token, token about to expire), and has the server check the
   * token when the last check is older than `VALIDATION_INTERVAL_MS`.
   */
  connect(): Promise<void>;
  /**
   * Runs a request once connected. On a 401, or on a doubtful outcome with a token the server no
   * longer accepts, authenticates again and retries once.
   */
  run<T>(request: () => Promise<T>, options?: RunOptions<T>): Promise<T>;
};

type SessionOptions = {
  /** Attempts when the server limits authentications (429): 2 per 3 s for guests. */
  maxAttempts?: number;
  /** Wait between those attempts. */
  retryDelayMs?: number;
  /** Current time in milliseconds (tests). */
  now?: () => number;
};

/** A token expiring within this delay is renewed before a request rather than sent. */
const TOKEN_RENEWAL_MARGIN_SECONDS = 60;

/**
 * PocketBase treats a revoked token (e.g. organizer account updated by `npm run setup` in
 * backend/) as a guest: lists come back empty and creations are refused, never with a 401. So
 * the server checks the token (auth-refresh) when it was last checked over a minute ago.
 */
export const VALIDATION_INTERVAL_MS = 60_000;

const hasStatus = (error: unknown, ...statuses: number[]) =>
  error instanceof ClientResponseError && statuses.includes(error.status);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Silent authentication of the single organizer account (no login screen, see CLAUDE.md,
 * "Accès organisateur"): auth-with-password on `organizers` with the organizer's secret key.
 */
export function createOrganizerSession(
  pb: PocketBase,
  { organizerEmail, organizerKey }: Pick<ApiConfig, 'organizerEmail' | 'organizerKey'>,
  { maxAttempts = 4, retryDelayMs = 1500, now = Date.now }: SessionOptions = {}
): OrganizerSession {
  const organizers = () => pb.collection(Collections.Organizers);
  /** When the server last accepted the token (authentication or check). */
  let validatedAt = 0;
  let pending: Promise<void> | null = null;

  async function authenticate() {
    for (let attempt = 1; ; attempt++) {
      try {
        await organizers().authWithPassword(organizerEmail, organizerKey);
        validatedAt = now();
        return;
      } catch (error) {
        if (!hasStatus(error, 429) || attempt >= maxAttempts) {
          throw error;
        }
        await wait(retryDelayMs);
      }
    }
  }

  /** Has the server check the token; returns false (and forgets it) if it is not accepted. */
  async function tokenAccepted(): Promise<boolean> {
    try {
      await organizers().authRefresh();
      validatedAt = now();
      return true;
    } catch (error) {
      if (!hasStatus(error, 401, 403, 404)) {
        throw error;
      }
      pb.authStore.clear();
      return false;
    }
  }

  /** A single operation at a time, however many callers (e.g. a double mount). */
  function exclusive(operation: () => Promise<void>) {
    pending ??= operation().finally(() => {
      pending = null;
    });
    return pending;
  }

  function tokenUsable() {
    return (
      pb.authStore.token !== '' && !isTokenExpired(pb.authStore.token, TOKEN_RENEWAL_MARGIN_SECONDS)
    );
  }

  function connect(): Promise<void> {
    if (pending) {
      return pending;
    }
    if (!tokenUsable()) {
      return exclusive(authenticate);
    }
    if (now() - validatedAt > VALIDATION_INTERVAL_MS) {
      return exclusive(async () => {
        if (!(await tokenAccepted())) {
          await authenticate();
        }
      });
    }
    return Promise.resolve();
  }

  /** After a doubtful outcome: true if the token was revoked and has been replaced. */
  function tokenReplaced(): Promise<boolean> {
    if (pending) {
      // Another caller is already authenticating or checking: the token will be fresh.
      return pending.then(() => true);
    }
    let replaced = false;
    return exclusive(async () => {
      if (!(await tokenAccepted())) {
        await authenticate();
        replaced = true;
      }
    }).then(() => replaced);
  }

  return {
    connect,
    async run(request, { isDoubtful } = {}) {
      await connect();
      let outcome: Outcome<Awaited<ReturnType<typeof request>>>;
      try {
        outcome = { result: await request() };
      } catch (error) {
        if (hasStatus(error, 401)) {
          pb.authStore.clear();
          await connect();
          return request();
        }
        outcome = { error };
      }
      if (isDoubtful?.(outcome) && (await tokenReplaced())) {
        return request();
      }
      if ('error' in outcome) {
        throw outcome.error;
      }
      return outcome.result;
    },
  };
}
