/** The connection to the back-end, established once at startup (silent organizer auth). */
export interface ServerConnection {
  connect(): Promise<void>;
}

/** No server to connect to (in-memory data, tests). */
export const alwaysConnected: ServerConnection = { connect: () => Promise.resolve() };

/** `app/.env` does not give the server address, the organizer e-mail or the key. */
export class ServerConfigMissingError extends Error {
  constructor() {
    super('EXPO_PUBLIC_DIANE_API_URL, _ORGANIZER_EMAIL or _ORGANIZER_KEY is not set');
    this.name = 'ServerConfigMissingError';
  }
}
