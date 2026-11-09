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
      // A gateway on the local network answers fast: 5 s is plenty.
      timeout: 5,
    });
  });

  it("gives the gateway the message id, so that it rejects a duplicate", () => {
    const request = gatewayRequest(
      {
        kind: "gateway",
        url: "http://192.168.1.50:8080",
        username: "sms",
        password: "secret",
      },
      { to: PHONE, text: "Bonjour", id: "rem-abc123def456ghi" },
    );

    expect(JSON.parse(request.body)).toStrictEqual({
      id: "rem-abc123def456ghi",
      textMessage: { text: "Bonjour" },
      phoneNumbers: [PHONE],
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

/** Message of the error thrown by `action`, "" if none. */
function thrown(action: () => void): string {
  try {
    action();
    return "";
  } catch (error) {
    return String(error);
  }
}

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

    const error = thrown(() => sms.send({ to: PHONE, text: "x" }));
    expect(error).toMatch(/unreachable/);
    expect(error).not.toContain(PHONE);
  });
});

describe("createTransports: SMS gateway unreachable", () => {
  it("does not call the gateway again once it was unreachable", () => {
    let attempts = 0;
    const { io } = fakeIo({
      httpSend: () => {
        attempts++;
        throw new Error("dial tcp: i/o timeout");
      },
    });
    const { sms } = createTransports(gatewayConfig(), io);

    const first = thrown(() => sms.send({ to: PHONE, text: "x" }));
    const second = thrown(() => sms.send({ to: "+33639981001", text: "y" }));
    const third = thrown(() => sms.send({ to: "+33639981002", text: "z" }));

    expect(attempts).toBe(1);
    expect(first).toMatch(/unreachable/);
    expect(second).toMatch(/unreachable.*not retried/);
    expect(third).toMatch(/unreachable.*not retried/);
  });

  it("keeps calling the gateway after an HTTP error answer", () => {
    const statuses = [500, 202, 400, 202];
    const { io, calls } = fakeIo({
      httpSend: (request: unknown) => {
        calls.http.push(request);
        return { statusCode: statuses[calls.http.length - 1] ?? 202 };
      },
    });
    const { sms } = createTransports(gatewayConfig(), io);

    const errors = statuses.map((_, i) =>
      thrown(() => sms.send({ to: PHONE, text: String(i) })),
    );

    expect(calls.http).toHaveLength(4);
    expect(errors).toStrictEqual([
      expect.stringContaining("HTTP 500"),
      "",
      expect.stringContaining("HTTP 400"),
      "",
    ]);
  });

  it("starts afresh with new transports (one sending each)", () => {
    let attempts = 0;
    const io = fakeIo({
      httpSend: () => {
        attempts++;
        throw new Error("connection refused");
      },
    }).io;

    thrown(() =>
      createTransports(gatewayConfig(), io).sms.send({ to: PHONE, text: "x" }),
    );
    thrown(() =>
      createTransports(gatewayConfig(), io).sms.send({ to: PHONE, text: "x" }),
    );

    expect(attempts).toBe(2);
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

    const error = thrown(() =>
      email.send({ to: EMAIL, subject: "s", text: "t" }),
    );
    expect(error).toMatch(/SMTP sending failed/);
    expect(error).not.toContain(EMAIL);
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
      kind: "",
    });
  });

  it("reports a sent message", () => {
    expect(deliver(ok, { to: PHONE, text: "x" })).toStrictEqual({
      status: "sent",
      error: "",
      kind: "",
    });
  });

  it("reports a failure with its reason", () => {
    expect(deliver(failing, { to: PHONE, text: "x" })).toStrictEqual({
      status: "failed",
      error: "SMS gateway answered HTTP 500",
      kind: "failed",
    });
  });

  /** Kind of failure of the first SMS sent through `httpSend`. */
  const kindOf = (
    httpSend: () => { statusCode: number },
    sms: Partial<Config["sms"]> = {},
  ) => {
    const transports = createTransports(
      gatewayConfig(sms),
      fakeIo({ httpSend }).io,
    );
    return [
      deliver(transports.sms, { to: PHONE, text: "x" }).kind,
      deliver(transports.sms, { to: "+33639981001", text: "y" }).kind,
    ];
  };

  it("reports a timeout as a failure (safe to resend: same message id)", () => {
    const timeout = () => {
      throw new Error(
        'Post "http://192.168.1.50:8080/messages": context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
      );
    };
    // The quick check fails too (phone off): the next SMS of the sending
    // are not attempted (gateway unreachable).
    expect(kindOf(timeout)).toStrictEqual(["failed", "not_attempted"]);
  });

  /** HTTP requests sent while delivering 3 SMS through `httpSend`. */
  const callsFor = (
    httpSend: (request: { url: string; method: string }) => {
      statusCode: number;
    },
  ) => {
    const requests: { url: string; method: string; timeout: number }[] = [];
    const transports = createTransports(
      gatewayConfig(),
      fakeIo({
        httpSend: (request: unknown) => {
          const typed = request as { url: string; method: string };
          requests.push(request as (typeof requests)[number]);
          return httpSend(typed);
        },
      }).io,
    );
    const kinds = ["+33639981000", "+33639981001", "+33639981002"].map(
      (to) => deliver(transports.sms, { to, text: "x" }).kind,
    );
    return { kinds, requests };
  };

  it("goes on after a timeout when a quick check shows the phone reachable (slow phone)", () => {
    const { kinds, requests } = callsFor((request) => {
      if (request.method === "GET") return { statusCode: 404 };
      throw new Error('Post "x": context deadline exceeded');
    });

    // Every SMS attempted (the id protects from duplicates).
    expect(kinds).toStrictEqual(["failed", "failed", "failed"]);
    const checks = requests.filter((request) => request.method === "GET");
    expect(checks).toHaveLength(3);
    expect(checks[0]).toMatchObject({
      url: "http://192.168.1.50:8080/health",
      timeout: 2,
    });
  });

  it("cuts the sending on a connection error, without quick check", () => {
    for (const message of [
      'Post "x": dial tcp 192.168.1.50:8080: connect: connection refused',
      'Post "x": dial tcp: lookup gateway.invalid: no such host',
      'Post "x": read tcp 1.2.3.4:5->6.7.8.9:80: read: connection reset by peer',
    ]) {
      const { kinds, requests } = callsFor(() => {
        throw new Error(message);
      });

      expect(kinds).toStrictEqual(["failed", "not_attempted", "not_attempted"]);
      expect(requests).toHaveLength(1);
    }
  });

  it("cuts the sending when the quick check fails too (phone off: same error as slow)", () => {
    const { kinds, requests } = callsFor(() => {
      throw new Error('Post "x": context deadline exceeded');
    });

    expect(kinds).toStrictEqual(["failed", "not_attempted", "not_attempted"]);
    expect(requests.map((request) => request.method)).toStrictEqual([
      "POST",
      "GET",
    ]);
  });

  it("reports a duplicate rejected by the gateway (409) as sent", () => {
    const transports = createTransports(
      gatewayConfig(),
      fakeIo({ httpSend: () => ({ statusCode: 409 }) }).io,
    );

    expect(
      deliver(transports.sms, { to: PHONE, text: "x", id: "inv-1" }),
    ).toStrictEqual({ status: "sent", error: "", kind: "" });
  });

  it("reports SMS not attempted (gateway unreachable) as not sent", () => {
    const transports = createTransports(
      gatewayConfig(),
      fakeIo({
        httpSend: () => {
          throw new Error("dial tcp: connect: connection refused");
        },
      }).io,
    );
    deliver(transports.sms, { to: PHONE, text: "x" });

    expect(
      deliver(transports.sms, { to: "+33639981001", text: "y" }),
    ).toMatchObject({ status: "not_sent", kind: "not_attempted" });
  });

  it("reports a connection that could not be made as a failure (not sent)", () => {
    for (const message of [
      "dial tcp 192.168.1.50:8080: connect: connection refused",
      "dial tcp 10.255.255.1:8080: i/o timeout",
      "dial tcp: lookup gateway.invalid: no such host",
    ]) {
      expect(
        kindOf(() => {
          throw new Error(message);
        }),
      ).toStrictEqual(["failed", "not_attempted"]);
    }
  });

  it("reports an HTTP error answer as a failure", () => {
    expect(kindOf(() => ({ statusCode: 503 }))).toStrictEqual([
      "failed",
      "failed",
    ]);
  });

  it("reports a gateway not configured as a failure (to fix)", () => {
    expect(kindOf(() => ({ statusCode: 202 }), { url: "" })).toStrictEqual([
      "failed",
      "failed",
    ]);
  });

  it("reports SMTP not configured or in error as a failure", () => {
    const disabled = createTransports(
      gatewayConfig(),
      fakeIo({ smtpEnabled: false }).io,
    );
    const broken = createTransports(
      gatewayConfig(),
      fakeIo({
        mailSend: () => {
          throw new Error("535 auth failed");
        },
      }).io,
    );
    const message = { to: EMAIL, subject: "s", text: "t" };

    expect(deliver(disabled.email, message).kind).toBe("failed");
    expect(deliver(broken.email, message).kind).toBe("failed");
  });
});
