/** Where the back-end is and how the app authenticates against it (see README, app/.env). */
export type ApiConfig = {
  /** PocketBase base URL, e.g. `http://192.168.1.20:8090`. */
  url: string;
  /** E-mail of the single organizer account (`DIANE_ORGANIZER_EMAIL` of the back-end). */
  organizerEmail: string;
  /** The organizer's secret key (`DIANE_ORGANIZER_KEY` of the back-end). */
  organizerKey: string;
};

type RawApiConfig = { [Name in keyof ApiConfig]: string | undefined };

/**
 * Reads the configuration from `app/.env`, or `null` if a value is missing. Expo inlines
 * `EXPO_PUBLIC_*` variables at build time, only when written in full as below: they end up in
 * the app, so the key is embedded in the demo app (accepted for the POC, see CLAUDE.md).
 */
export function readApiConfig(
  env: RawApiConfig = {
    url: process.env.EXPO_PUBLIC_DIANE_API_URL,
    organizerEmail: process.env.EXPO_PUBLIC_DIANE_ORGANIZER_EMAIL,
    organizerKey: process.env.EXPO_PUBLIC_DIANE_ORGANIZER_KEY,
  }
): ApiConfig | null {
  const url = env.url?.trim().replace(/\/+$/, '');
  const organizerEmail = env.organizerEmail?.trim();
  const organizerKey = env.organizerKey?.trim();
  if (!url || !organizerEmail || !organizerKey) {
    return null;
  }
  return { url, organizerEmail, organizerKey };
}
