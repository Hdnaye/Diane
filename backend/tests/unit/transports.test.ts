import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { transportConfig, base64, gatewayRequest, createTransports, deliver } =
  require("../../pb_hooks/lib/transports.cjs") as typeof import("../../pb_hooks/lib/transports.cjs");

type Config = ReturnType<typeof transportConfig>;

const PHONE = "+33639981000";
const EMAIL = "member@example.com";

const env =
  (values: Record<string, string>) =>
  (name: string): string =>
    values[name] ?? "";

describe("transportConfig", () => {
  it("reads the gateway and the SMTP sender from the environment", () => {
    expect(
      transportConfig(
        env({
          DIANE_SMS_GATEWAY_URL: " http://192.168.1.50:8080/ ",
          DIANE_SMS_GATEWAY_USERNAME: "sms",
          DIANE_SMS_GATEWAY_PASSWORD: "secret",
          DIANE_EMAIL_SENDER_ADDRESS: "diane@example.org",
          DIANE_EMAIL_SENDER_NAME: "Diane",
        }),
      ),
    ).toStrictEqual({
      sms: {
        kind: "gateway",
        url: "http://192.168.1.50:8080",
        username: "sms",
        password: "secret",
      },
      email: {
        kind: "smtp",
        senderAddress: "diane@example.org",
        senderName: "Diane",
      },
      outboxDir: "",
    });
  });

  it("selects the fake transports by configuration", () => {
    const config = transportConfig(
      env({
        DIANE_SMS_TRANSPORT: "fake",
        DIANE_EMAIL_TRANSPORT: "fake",
        DIANE_FAKE_OUTBOX_DIR: "/tmp/outbox",
      }),
    );

    expect(config.sms.kind).toBe("fake");
    expect(config.email.kind).toBe("fake");
    expect(config.outboxDir).toBe("/tmp/outbox");
  });

  it("falls back to the real transports for an unknown value", () => {
    const config = transportConfig(
      env({ DIANE_SMS_TRANSPORT: "Fake ", DIANE_EMAIL_TRANSPORT: "other" }),
    );

    expect(config.sms.kind).toBe("gateway");
    expect(config.email.kind).toBe("smtp");
  });
});

describe("base64", () => {
  it.each([
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["sms:secret", "c21zOnNlY3JldA=="],
    ["é€", "w6nigqw="],
  ])("encodes %j as %j", (input, expected) => {
    expect(base64(input)).toBe(expected);
    expect(base64(input)).toBe(Buffer.from(input, "utf8").toString("base64"));
  });
});

describe("gatewayRequest", () => {
  it("posts the message to SMS Gateway for Android with basic auth", () => {
    const request = gatewayRequest(
      {
        kind: "gateway",
        url: "http://192.168.1.50:8080",
        username: "sms",
        password: "secret",
      },
      { to: PHONE, text: "Bonjour" },
    );

    expect(request).toStrictEqual({
      url: "http://192.168.1.50:8080/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from("sms:secret").toString("base64")}`,
      },
      body: JSON.stringify({
        textMessage: { text: "Bonjour" },
        phoneNumbers: [PHONE],
      }),
      timeout: 15,
    });
  });

  it("works with the cloud server URL", () => {
    expect(
      gatewayRequest(
        {
          kind: "gateway",
          url: "https://api.sms-gate.app/3rdparty/v1",
          username: "u",
          password: "p",
        },
        { to: PHONE, text: "x" },
      ).url,
    ).toBe("https://api.sms-gate.app/3rdparty/v1/messages");
  });
});

/** Fake PocketBase primitives recording their calls. */
function fakeIo(
  overrides: Partial<Parameters<typeof createTransports>[1]> = {},
) {
  const calls = {
    http: [] as unknown[],
    mail: [] as unknown[],
    record: [] as [string, unknown][],
  };
  const io = {
    httpSend: (request: unknown) => {
      calls.http.push(request);
      return { statusCode: 202 };
    },
    mailSend: (message: unknown) => {
      calls.mail.push(message);
    },
    record: (kind: string, message: unknown) => {
      calls.record.push([kind, message]);
    },
    smtpEnabled: true,
    defaultSender: { address: "pb@example.org", name: "PocketBase" },
    ...overrides,
  };
  return { io, calls };
}

const gatewayConfig = (sms: Partial<Config["sms"]> = {}): Config => ({
  sms: {
    kind: "gateway",
    url: "http://192.168.1.50:8080",
    username: "sms",
    password: "secret",
    ...sms,
  },
  email: { kind: "smtp", senderAddress: "", senderName: "" },
  outboxDir: "",
});

describe("createTransports: SMS gateway", () => {
  it("sends through the gateway", () => {
    const { io, calls } = fakeIo();

    createTransports(gatewayConfig(), io).sms.send({ to: PHONE, text: "x" });

    expect(calls.http).toHaveLength(1);
  });

  it.each([{ url: "" }, { username: "" }, { password: "" }])(
    "fails without calling anything when not configured (%j)",
    (missing) => {
      const { io, calls } = fakeIo();
      const { sms } = createTransports(gatewayConfig(missing), io);

      expect(() => sms.send({ to: PHONE, text: "x" })).toThrow(
        /not configured/,
      );
      expect(calls.http).toHaveLength(0);
    },
  );

  it.each([400, 401, 500, 503])(
    "fails when the gateway answers HTTP %i, without personal data",
    (statusCode) => {
      const { io } = fakeIo({ httpSend: () => ({ statusCode }) });
      const { sms } = createTransports(gatewayConfig(), io);

      expect(() => sms.send({ to: PHONE, text: "x" })).toThrow(
        `HTTP ${statusCode}`,
      );
    },
  );

  it("fails when the gateway is unreachable, without repeating the cause", () => {
    const { io } = fakeIo({
      httpSend: () => {
        throw new Error(`dial tcp: lookup for ${PHONE}`);
      },
    });
    const { sms } = createTransports(gatewayConfig(), io);

    expect(() => sms.send({ to: PHONE, text: "x" })).toThrow(/unreachable/);
    try {
      sms.send({ to: PHONE, text: "x" });
    } catch (error) {
      expect(String(error)).not.toContain(PHONE);
    }
  });
});

describe("createTransports: SMTP", () => {
  it("sends a text e-mail from the configured sender", () => {
    const { io, calls } = fakeIo();
    const config = gatewayConfig();
    config.email = {
      kind: "smtp",
      senderAddress: "diane@example.org",
      senderName: "Diane",
    };

    createTransports(config, io).email.send({
      to: EMAIL,
      subject: "Battue",
      text: "Bonjour",
    });

    expect(calls.mail).toStrictEqual([
      {
        from: { address: "diane@example.org", name: "Diane" },
        to: [{ address: EMAIL }],
        subject: "Battue",
        text: "Bonjour",
      },
    ]);
  });

  it("uses PocketBase's sender by default", () => {
    const { io, calls } = fakeIo();

    createTransports(gatewayConfig(), io).email.send({
      to: EMAIL,
      subject: "s",
      text: "t",
    });

    expect(calls.mail[0]).toMatchObject({
      from: { address: "pb@example.org", name: "PocketBase" },
    });
  });

  it("fails without calling anything when SMTP is disabled", () => {
    const { io, calls } = fakeIo({ smtpEnabled: false });
    const { email } = createTransports(gatewayConfig(), io);

    expect(() => email.send({ to: EMAIL, subject: "s", text: "t" })).toThrow(
      /not configured/,
    );
    expect(calls.mail).toHaveLength(0);
  });

  it("fails without a sender address", () => {
    const { io, calls } = fakeIo({
      defaultSender: { address: "", name: "" },
    });
    const { email } = createTransports(gatewayConfig(), io);

    expect(() => email.send({ to: EMAIL, subject: "s", text: "t" })).toThrow(
      /sender/,
    );
    expect(calls.mail).toHaveLength(0);
  });

  it("does not repeat the SMTP error, which may quote the address", () => {
    const { io } = fakeIo({
      mailSend: () => {
        throw new Error(`550 <${EMAIL}> rejected`);
      },
    });
    const { email } = createTransports(gatewayConfig(), io);

    expect(() => email.send({ to: EMAIL, subject: "s", text: "t" })).toThrow(
      /SMTP sending failed/,
    );
    try {
      email.send({ to: EMAIL, subject: "s", text: "t" });
    } catch (error) {
      expect(String(error)).not.toContain(EMAIL);
    }
  });
});

describe("createTransports: fakes", () => {
  const fakeConfig: Config = {
    sms: { kind: "fake", url: "", username: "", password: "" },
    email: { kind: "fake", senderAddress: "", senderName: "" },
    outboxDir: "/tmp/outbox",
  };

  it("records messages instead of sending them", () => {
    const { io, calls } = fakeIo({ smtpEnabled: false });
    const transports = createTransports(fakeConfig, io);

    transports.sms.send({ to: PHONE, text: "x" });
    transports.email.send({ to: EMAIL, subject: "s", text: "t" });

    expect(calls.record).toStrictEqual([
      ["sms", { to: PHONE, text: "x" }],
      ["email", { to: EMAIL, subject: "s", text: "t" }],
    ]);
    expect(calls.http).toHaveLength(0);
    expect(calls.mail).toHaveLength(0);
  });

  it("fails without an outbox directory", () => {
    const { io } = fakeIo();
    const { sms } = createTransports({ ...fakeConfig, outboxDir: "" }, io);

    expect(() => sms.send({ to: PHONE, text: "x" })).toThrow(/outbox/);
  });
});

describe("deliver", () => {
  const ok = { send: () => undefined };
  const failing = {
    send: () => {
      throw new Error("SMS gateway answered HTTP 500");
    },
  };

  it("skips a member without this contact", () => {
    expect(deliver(ok, { to: "", text: "x" })).toStrictEqual({
      status: "skipped",
      error: "",
    });
  });

  it("reports a sent message", () => {
    expect(deliver(ok, { to: PHONE, text: "x" })).toStrictEqual({
      status: "sent",
      error: "",
    });
  });

  it("reports a failure with its reason", () => {
    expect(deliver(failing, { to: PHONE, text: "x" })).toStrictEqual({
      status: "failed",
      error: "SMS gateway answered HTTP 500",
    });
  });
});
