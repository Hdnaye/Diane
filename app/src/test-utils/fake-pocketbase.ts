// A fake PocketBase server behind a mocked `fetch`: the real SDK runs, no request leaves the test.

export type FakeRequest = {
  method: string;
  /** Path and query, e.g. `/api/collections/hunts/records?sort=date`. */
  path: string;
  headers: Record<string, string>;
  body: unknown;
};
export type FakeResponse = { status: number; body?: unknown };
export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

export const FAKE_API_URL = 'http://pocketbase.test';

/** Installs a fake `fetch` answering with `handler`; returns the requests received. */
export function fakePocketBase(handler: FakeHandler) {
  const requests: FakeRequest[] = [];
  const fetchMock = jest.fn(async (url: string, options: RequestInit = {}) => {
    const request: FakeRequest = {
      method: options.method ?? 'GET',
      path: url.replace(FAKE_API_URL, ''),
      headers: (options.headers ?? {}) as Record<string, string>,
      body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body,
    };
    requests.push(request);
    const { status, body = {} } = await handler(request);
    return { status, url, json: async () => body };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { requests, fetchMock };
}

/** A fake JWT the SDK accepts, expiring in `seconds` (negative: already expired). */
export function fakeToken(seconds = 3600, id = 'fake-token') {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp, id })}.signature`;
}

export const AUTH_PATH = '/api/collections/organizers/auth-with-password';

/** A successful organizer authentication, with a fictitious organizer. */
export function authSuccess(token = fakeToken()): FakeResponse {
  return {
    status: 200,
    body: {
      token,
      record: {
        id: 'organizer1',
        collectionId: 'pbc_organizers',
        collectionName: 'organizers',
        email: 'organizer@example.com',
      },
    },
  };
}

export const tooManyRequests: FakeResponse = {
  status: 429,
  body: { status: 429, message: 'Too Many Requests.', data: {} },
};
