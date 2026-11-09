// SMS and e-mail transports, selected by environment variables and built on
// injected PocketBase primitives (HTTP client, mail client, file writer), so
// that this module stays pure and the hooks stay thin.
//
// - SMS "gateway" (default): SMS Gateway for Android
//   (https://github.com/capcom6/android-sms-gateway, docs.sms-gate.app),
//   `POST {DIANE_SMS_GATEWAY_URL}/messages` with HTTP basic auth. The same
//   API is served by the phone itself (local server, e.g.
//   http://192.168.1.50:8080) and by the cloud relay
//   (https://api.sms-gate.app/3rdparty/v1). 202 = queued on the phone.
// - E-mail "smtp" (default): PocketBase's mailer, with the SMTP settings of
//   the admin UI. When SMTP is disabled, PocketBase would fall back to the
//   local `sendmail`: refused instead.
// - "fake" (tests only): messages are written to DIANE_FAKE_OUTBOX_DIR.
//
// Errors never contain a phone number, an e-mail address or a message:
// they may end up in logs and in invitation records.
// Pure CommonJS: loaded by hooks with require(`${__hooks}/lib/transports.cjs`)
// and by Vitest with createRequire.

/**
 * Seconds before giving up on the SMS gateway: a phone on the local network
 * (or the cloud relay) answers in well under a second.
 */
const GATEWAY_TIMEOUT_S = 5;

/**
 * Seconds of the quick reachability check after a timeout (see
 * createTransports).
 */
const HEALTH_CHECK_TIMEOUT_S = 2;

/**
 * Errors proving that no connection to the gateway could be made or kept
 * (Go net errors: refused, reset, DNS, unreachable network). A timeout
 * ("context deadline exceeded") cannot tell a phone switched off (the
 * connection is never established) from a slow one: Go gives the same
 * text, checked against PocketBase 0.40.6.
 */
const CONNECTION_ERROR =
  /dial tcp|connection refused|connection reset|no such host|network is unreachable|no route to host|broken pipe|EOF/i;

/**
 * @typedef {object} SmsConfig
 * @property {"gateway" | "fake"} kind
 * @property {string} url Base URL of the gateway API, without trailing "/".
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {object} EmailConfig
 * @property {"smtp" | "fake"} kind
 * @property {string} senderAddress "" = PocketBase's sender (admin UI).
 * @property {string} senderName
 */

/**
 * @typedef {object} TransportConfig
 * @property {SmsConfig} sms
 * @property {EmailConfig} email
 * @property {string} outboxDir Directory of the fake transports.
 */

/**
 * Transport configuration from environment variables.
 *
 * @param {(name: string) => string} getenv e.g. $os.getenv.
 * @returns {TransportConfig}
 */
function transportConfig(getenv) {
  /** @param {string} name */
  const read = (name) => (getenv(name) || "").trim();
  return {
    sms: {
      kind: read("DIANE_SMS_TRANSPORT") === "fake" ? "fake" : "gateway",
      url: read("DIANE_SMS_GATEWAY_URL").replace(/\/+$/, ""),
      username: read("DIANE_SMS_GATEWAY_USERNAME"),
      password: read("DIANE_SMS_GATEWAY_PASSWORD"),
    },
    email: {
      kind: read("DIANE_EMAIL_TRANSPORT") === "fake" ? "fake" : "smtp",
      senderAddress: read("DIANE_EMAIL_SENDER_ADDRESS"),
      senderName: read("DIANE_EMAIL_SENDER_NAME"),
    },
    outboxDir: read("DIANE_FAKE_OUTBOX_DIR"),
  };
}

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 of the UTF-8 bytes of `text` (PocketBase's JSVM has no btoa).
 *
 * @param {string} text
 * @returns {string}
 */
function base64(text) {
  /** @type {number[]} */
  const bytes = [];
  for (const char of text) {
    const code = /** @type {number} */ (char.codePointAt(0));
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
    const triple = (a << 16) | (b << 8) | c;
    result += BASE64[triple >> 18];
    result += BASE64[(triple >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : "=";
    result += i + 2 < bytes.length ? BASE64[triple & 63] : "=";
  }
  return result;
}

/**
 * @typedef {object} SmsMessage
 * @property {string} to   E.164 phone number, "" when none.
 * @property {string} text
 * @property {string} [id] Message id given to the gateway, deterministic
 *   per logical message (e.g. "rem-<invitation id>"): the gateway rejects
 *   an id it already took (409), so a resent message is never sent twice.
 */

/**
 * @typedef {object} EmailMessage
 * @property {string} to   Address, "" when none.
 * @property {string} subject
 * @property {string} text
 */

/**
 * HTTP request sending `message` through SMS Gateway for Android.
 *
 * @param {SmsConfig} config
 * @param {SmsMessage} message
 */
function gatewayRequest(config, message) {
  return {
    url: `${config.url}/messages`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${base64(`${config.username}:${config.password}`)}`,
    },
    body: JSON.stringify(
      message.id
        ? {
            id: message.id,
            textMessage: { text: message.text },
            phoneNumbers: [message.to],
          }
        : { textMessage: { text: message.text }, phoneNumbers: [message.to] },
    ),
    timeout: GATEWAY_TIMEOUT_S,
  };
}

/**
 * Quick check that the gateway's HTTP server answers at all (any status
 * counts, even 404: the phone is reachable).
 *
 * @param {SmsConfig} config
 */
function healthCheckRequest(config) {
  return {
    url: `${config.url}/health`,
    method: "GET",
    headers: {
      Authorization: `Basic ${base64(`${config.username}:${config.password}`)}`,
    },
    body: "",
    timeout: HEALTH_CHECK_TIMEOUT_S,
  };
}

/**
 * @typedef {object} TransportIo PocketBase primitives.
 * @property {(request: { url: string, method: string, headers: Record<string, string>, body: string, timeout: number }) => { statusCode: number }} httpSend
 * @property {(message: { from: { address: string, name: string }, to: { address: string }[], subject: string, text: string }) => void} mailSend
 * @property {(kind: "sms" | "email", message: SmsMessage | EmailMessage) => void} record
 *   Writes a message of a fake transport into the outbox.
 * @property {boolean} smtpEnabled
 * @property {{ address: string, name: string }} defaultSender
 */

/**
 * @template M
 * @typedef {{ send: (message: M) => void }} Transport Throws on failure,
 *   an Error whose `kind` property is a FailureKind.
 */

/**
 * @typedef {"failed" | "not_attempted"} FailureKind
 * - failed: attempted and failed (connection refused, timeout, HTTP error,
 *   SMTP error), or not configured. After a timeout the phone may have
 *   taken the SMS: resending it is safe thanks to its id (duplicate
 *   rejected by the gateway, see SmsMessage);
 * - not_attempted: not tried, the gateway was already found unreachable
 *   during this sending (status `not_sent`).
 */

/**
 * @param {string} message Without personal data.
 * @param {FailureKind} kind
 */
function failure(message, kind) {
  return Object.assign(new Error(message), { kind });
}

/**
 * @param {TransportConfig} config
 * @param {TransportIo} io
 * @returns {{ sms: Transport<SmsMessage>, email: Transport<EmailMessage> }}
 */
function createTransports(config, io) {
  /** @param {"sms" | "email"} kind */
  const fake = (kind) => ({
    /** @param {SmsMessage | EmailMessage} message */
    send(message) {
      if (!config.outboxDir) {
        throw failure("Fake transport without outbox directory.", "failed");
      }
      io.record(kind, message);
    },
  });

  // Once the gateway was unreachable, the next SMS of these transports (one
  // sending) are not attempted (`not_sent`): a phone switched off would
  // otherwise cost one timeout per SMS. Unreachable: a connection error
  // (refused, reset, DNS...), or a timeout followed by a failed quick check
  // (HEALTH_CHECK_TIMEOUT_S). A timeout while the phone answers the check
  // is a slow phone: that SMS failed (it may have been taken: resending it
  // is safe, see SmsMessage.id) and the next ones are still sent. An HTTP
  // error answer concerns one message: the next ones are still sent.
  let unreachable = false;

  /** Whether the gateway answers the quick check. */
  const reachable = () => {
    try {
      io.httpSend(healthCheckRequest(config.sms));
      return true;
    } catch {
      return false;
    }
  };

  /** @type {Transport<SmsMessage>} */
  const gateway = {
    send(message) {
      const { url, username, password } = config.sms;
      if (!url || !username || !password) {
        throw failure("SMS gateway not configured.", "failed");
      }
      if (unreachable) {
        throw failure(
          "SMS gateway unreachable (not retried).",
          "not_attempted",
        );
      }
      let response;
      try {
        response = io.httpSend(gatewayRequest(config.sms, message));
      } catch (cause) {
        // The cause may quote the request: only classified, not repeated.
        const text = String(cause instanceof Error ? cause.message : cause);
        if (!CONNECTION_ERROR.test(text) && reachable()) {
          throw failure("SMS gateway did not answer in time.", "failed");
        }
        unreachable = true;
        throw failure("SMS gateway unreachable.", "failed");
      }
      // Duplicate id: the gateway already took this message (an earlier
      // attempt answered too late): sent.
      if (response.statusCode === 409 && message.id) return;
      if (response.statusCode < 200 || response.statusCode > 299) {
        throw failure(
          `SMS gateway answered HTTP ${response.statusCode}.`,
          "failed",
        );
      }
    },
  };

  /** @type {Transport<EmailMessage>} */
  const smtp = {
    send(message) {
      if (!io.smtpEnabled) throw failure("SMTP not configured.", "failed");
      const address = config.email.senderAddress || io.defaultSender.address;
      if (!address) throw failure("No e-mail sender address.", "failed");
      const name = config.email.senderAddress
        ? config.email.senderName
        : io.defaultSender.name;
      try {
        io.mailSend({
          from: { address, name },
          to: [{ address: message.to }],
          subject: message.subject,
          text: message.text,
        });
      } catch {
        // SMTP errors may quote the recipient: not repeated.
        throw failure("SMTP sending failed.", "failed");
      }
    },
  };

  return {
    sms: config.sms.kind === "fake" ? fake("sms") : gateway,
    email: config.email.kind === "fake" ? fake("email") : smtp,
  };
}

/**
 * Sends `message` unless it has no recipient.
 *
 * @template {{ to: string }} M
 * @param {Transport<M>} transport
 * @param {M} message
 * @returns {{ status: "sent" | "failed" | "skipped" | "not_sent", error: string, kind: FailureKind | "" }}
 *   status `not_sent`: not attempted (gateway already unreachable); error:
 *   reason of a failure, without personal data; kind: "" unless failed.
 */
function deliver(transport, message) {
  if (!message.to) return { status: "skipped", error: "", kind: "" };
  try {
    transport.send(message);
    return { status: "sent", error: "", kind: "" };
  } catch (error) {
    const notAttempted =
      /** @type {{ kind?: unknown }} */ (error).kind === "not_attempted";
    return {
      status: notAttempted ? "not_sent" : "failed",
      error: error instanceof Error ? error.message : "Sending failed.",
      kind: notAttempted ? "not_attempted" : "failed",
    };
  }
}

module.exports = {
  transportConfig,
  base64,
  gatewayRequest,
  healthCheckRequest,
  createTransports,
  deliver,
};
