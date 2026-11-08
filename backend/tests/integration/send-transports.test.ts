// Real transports of the invitations, against local stand-ins (no real
// network call): an HTTP server playing SMS Gateway for Android and an SMTP
// server. Also: what happens when nothing is configured, and PocketBase's
// output never contains a phone number or an e-mail address.
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { huntDays, phoneNumbers, recordsPath, uniqueEmail } from "./api.js";
import { startTestInstance, type TestInstance } from "./instance.js";
import { freePort } from "./pocketbase-process.js";

const nextPhone = phoneNumbers(42);
const nextDay = huntDays(2114);
const DEADLINE = "2113-12-01 17:00:00.000Z";

interface GatewayRequest {
  method: string;
  url: string;
  authorization: string;
  body: unknown;
}

/** HTTP server answering like SMS Gateway for Android, recording requests. */
async function startFakeGateway() {
  const requests: GatewayRequest[] = [];
  let status = 202;
  const server: Server = createHttpServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: request.headers.authorization ?? "",
        body: JSON.parse(body || "null"),
      });
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "x", state: "Pending" }));
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    answerWith(code: number) {
      status = code;
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** TCP server accepting connections and never answering (phone asleep). */
async function startSilentGateway() {
  const sockets = new Set<import("node:net").Socket>();
  let connections = 0;
  const server = createTcpServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const port = await freePort();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    url: `http://127.0.0.1:${port}`,
    connections: () => connections,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

interface Mail {
  from: string;
  to: string[];
  data: string;
}

/** Minimal SMTP server (no TLS, no auth) recording the mails. */
async function startFakeSmtp() {
  const mails: Mail[] = [];
  const server = createTcpServer((socket) => {
    let buffer = "";
    let inData = false;
    let mail: Mail = { from: "", to: [], data: "" };
    socket.write("220 localhost ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          mail.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          mails.push(mail);
          mail = { from: "", to: [], data: "" };
          socket.write("250 OK\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const command = line.toUpperCase();
        if (command.startsWith("EHLO")) {
          socket.write("250-localhost\r\n250 8BITMIME\r\n");
        } else if (command.startsWith("MAIL FROM:")) {
          mail.from = line.slice(10).trim();
          socket.write("250 OK\r\n");
        } else if (command.startsWith("RCPT TO:")) {
          mail.to.push(line.slice(8).trim());
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.end("221 Bye\r\n");
          return;
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    port,
    mails,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Members, hunt and helpers on an instance. */
function fixtures(pb: () => TestInstance) {
  async function create(collection: string, body: Record<string, unknown>) {
    const response = await pb().api(recordsPath(collection), {
      method: "POST",
      token: pb().organizerToken,
      body,
    });
    if (response.status !== 200) {
      throw new Error(`Setup failed: HTTP ${response.status}`);
    }
    return response.body as Record<string, string> & { id: string };
  }
  return {
    create,
    /** Deactivates every member, so that each test chooses who is invited. */
    async deactivateEveryone() {
      const list = await pb().api(
        `${recordsPath("members")}?perPage=500&filter=${encodeURIComponent("active=true")}`,
        { token: pb().organizerToken },
      );
      for (const member of list.body.items) {
        await pb().api(recordsPath("members", member.id), {
          method: "PATCH",
          token: pb().organizerToken,
          body: { active: false },
        });
      }
    },
    newMember: () =>
      create("members", {
        name: "Paul Moreau",
        phone: nextPhone(),
        email: uniqueEmail(),
      }),
    newHunt: () =>
      create("hunts", {
        date: nextDay(),
        meeting_time: "08:00",
        response_deadline: DEADLINE,
      }),
    send: (huntId: string) =>
      pb().api(`/api/diane/hunts/${huntId}/send-invitations`, {
        method: "POST",
        token: pb().organizerToken,
      }),
    async invitationOf(huntId: string, memberId: string) {
      const response = await pb().api(
        `${recordsPath("invitations")}?filter=${encodeURIComponent(`hunt="${huntId}" && member="${memberId}"`)}`,
        { token: pb().organizerToken },
      );
      return response.body.items[0] as Record<string, string>;
    },
  };
}

/** No phone number, e-mail address or secret in what PocketBase printed. */
function expectNoPersonalData(output: string, values: string[]) {
  for (const value of values) {
    expect(output).not.toContain(value);
    // Also in national format (06 39 98 ...).
    if (value.startsWith("+33")) expect(output).not.toContain(value.slice(3));
  }
}

describe("invitations through the SMS gateway and SMTP", () => {
  let pb: TestInstance;
  let gateway: Awaited<ReturnType<typeof startFakeGateway>>;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
  const password = randomBytes(16).toString("hex");
  const sensitive: string[] = [password];
  const f = fixtures(() => pb);

  beforeAll(async () => {
    gateway = await startFakeGateway();
    smtp = await startFakeSmtp();
    pb = await startTestInstance({
      env: {
        DIANE_SMS_TRANSPORT: "",
        DIANE_EMAIL_TRANSPORT: "",
        DIANE_SMS_GATEWAY_URL: `${gateway.url}/`,
        DIANE_SMS_GATEWAY_USERNAME: "sms",
        DIANE_SMS_GATEWAY_PASSWORD: password,
        DIANE_EMAIL_SENDER_ADDRESS: "diane@example.org",
        DIANE_EMAIL_SENDER_NAME: "Diane",
      },
    });
    const settings = await pb.api("/api/settings", {
      method: "PATCH",
      token: pb.superuserToken,
      body: {
        smtp: {
          enabled: true,
          host: "127.0.0.1",
          port: smtp.port,
          tls: false,
        },
      },
    });
    if (settings.status !== 200) throw new Error("SMTP settings failed");
  });

  afterAll(async () => {
    await pb?.stop();
    await gateway?.stop();
    await smtp?.stop();
  });

  beforeEach(async () => {
    await f.deactivateEveryone();
  });

  it("sends the SMS through the gateway API, with basic auth", async () => {
    const member = await f.newMember();
    sensitive.push(member.phone as string, member.email as string);
    const hunt = await f.newHunt();

    const response = await f.send(hunt.id);

    expect(response.body.sms).toStrictEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    const request = gateway.requests.find((item) =>
      JSON.stringify(item.body).includes(member.phone as string),
    );
    expect(request).toMatchObject({
      method: "POST",
      url: "/messages",
      authorization: `Basic ${Buffer.from(`sms:${password}`).toString("base64")}`,
      body: {
        textMessage: { text: expect.stringContaining("Battue le") },
        phoneNumbers: [member.phone],
      },
    });
    expect((await f.invitationOf(hunt.id, member.id)).sms_status).toBe("sent");
  });

  it("sends the e-mail through SMTP, from the configured sender", async () => {
    const member = await f.newMember();
    sensitive.push(member.phone as string, member.email as string);
    const hunt = await f.newHunt();

    const response = await f.send(hunt.id);

    expect(response.body.email).toStrictEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    const mail = smtp.mails.find((item) =>
      item.to.some((to) => to.includes(member.email as string)),
    );
    expect(mail?.from).toContain("diane@example.org");
    expect((await f.invitationOf(hunt.id, member.id)).email_status).toBe(
      "sent",
    );
  });

  it("records a failure when the gateway answers an error", async () => {
    const member = await f.newMember();
    sensitive.push(member.phone as string, member.email as string);
    const hunt = await f.newHunt();
    gateway.answerWith(500);

    try {
      const response = await f.send(hunt.id);

      expect(response.status).toBe(200);
      expect(response.body.sms).toStrictEqual({
        sent: 0,
        failed: 1,
        skipped: 0,
      });
      const invitation = await f.invitationOf(hunt.id, member.id);
      expect(invitation).toMatchObject({
        sms_status: "failed",
        email_status: "sent",
      });
    } finally {
      gateway.answerWith(202);
    }
  });

  it("keeps sending the next SMS after an HTTP error answer", async () => {
    const members = [await f.newMember(), await f.newMember()];
    for (const member of members) {
      sensitive.push(member.phone as string, member.email as string);
    }
    const hunt = await f.newHunt();
    const before = gateway.requests.length;
    gateway.answerWith(503);

    try {
      const response = await f.send(hunt.id);

      expect(response.body.sms).toStrictEqual({
        sent: 0,
        failed: 2,
        skipped: 0,
      });
      expect(gateway.requests.length - before).toBe(2);
    } finally {
      gateway.answerWith(202);
    }
  });

  it("prints no phone number, e-mail address or gateway secret", () => {
    expect(sensitive.length).toBeGreaterThan(1);
    expectNoPersonalData(pb.process.output(), sensitive);
  });
});

describe("invitations without SMS gateway nor SMTP", () => {
  let pb: TestInstance;
  const sensitive: string[] = [];
  const f = fixtures(() => pb);

  beforeAll(async () => {
    pb = await startTestInstance({
      env: { DIANE_SMS_TRANSPORT: "", DIANE_EMAIL_TRANSPORT: "" },
    });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  it("creates the invitations and records the failures", async () => {
    const member = await f.newMember();
    sensitive.push(member.phone as string, member.email as string);
    const phoneOnly = await f.create("members", {
      name: "Jean Petit",
      phone: nextPhone(),
    });
    sensitive.push(phoneOnly.phone as string);
    const hunt = await f.newHunt();

    const response = await f.send(hunt.id);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      invited: 2,
      sms: { sent: 0, failed: 2, skipped: 0 },
      email: { sent: 0, failed: 1, skipped: 1 },
    });
    expect(await f.invitationOf(hunt.id, member.id)).toMatchObject({
      participation: "pending",
      sms_status: "failed",
      email_status: "failed",
    });
    expect(await f.invitationOf(hunt.id, phoneOnly.id)).toMatchObject({
      sms_status: "failed",
      email_status: "skipped",
    });
  });

  it("prints no phone number or e-mail address", () => {
    expect(sensitive.length).toBeGreaterThan(1);
    expectNoPersonalData(pb.process.output(), sensitive);
  });
});

describe("invitations through a gateway that does not answer", () => {
  let pb: TestInstance;
  let gateway: Awaited<ReturnType<typeof startSilentGateway>>;
  const f = fixtures(() => pb);

  beforeAll(async () => {
    gateway = await startSilentGateway();
    pb = await startTestInstance({
      env: {
        DIANE_SMS_TRANSPORT: "",
        DIANE_SMS_GATEWAY_URL: gateway.url,
        DIANE_SMS_GATEWAY_USERNAME: "sms",
        DIANE_SMS_GATEWAY_PASSWORD: randomBytes(16).toString("hex"),
      },
    });
  });

  afterAll(async () => {
    await pb?.stop();
    await gateway?.stop();
  });

  it(
    "gives up after one timeout instead of waiting for every SMS",
    { timeout: 30_000 },
    async () => {
      for (let i = 0; i < 4; i++) await f.newMember();
      const hunt = await f.newHunt();
      const start = Date.now();

      const response = await f.send(hunt.id);

      const elapsed = Date.now() - start;
      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        invited: 4,
        sms: { sent: 0, failed: 4, skipped: 0 },
        email: { sent: 4, failed: 0, skipped: 0 },
      });
      expect(gateway.connections()).toBe(1);
      // One 5 s timeout, not 4 x 15 s.
      expect(elapsed).toBeGreaterThanOrEqual(4_500);
      expect(elapsed).toBeLessThan(9_000);
    },
  );
});

describe("invitations without public URL", () => {
  let pb: TestInstance;
  const f = fixtures(() => pb);

  beforeAll(async () => {
    pb = await startTestInstance({ env: { DIANE_PUBLIC_URL: "" } });
  });

  afterAll(async () => {
    await pb?.stop();
  });

  it("refuses to send links that would not work", async () => {
    await f.newMember();
    const hunt = await f.newHunt();

    const response = await f.send(hunt.id);

    expect(response.status).toBe(503);
    expect(response.body.data.config.code).toBe("public_url_missing");
    const invitations = await pb.api(
      `${recordsPath("invitations")}?filter=${encodeURIComponent(`hunt="${hunt.id}"`)}`,
      { token: pb.organizerToken },
    );
    expect(invitations.body.totalItems).toBe(0);
  });
});
