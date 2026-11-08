// Local stand-ins for the transports of the invitations (no real network
// call): an HTTP server playing SMS Gateway for Android, a server accepting
// connections and never answering, and an SMTP server.
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { freePort } from "./pocketbase-process.js";

export interface GatewayRequest {
  method: string;
  url: string;
  authorization: string;
  body: unknown;
}

/**
 * HTTP server answering like SMS Gateway for Android, recording requests.
 * Like the real gateway, a message whose client-provided `id` was already
 * accepted is rejected with 409 Conflict (MessagesService.kt).
 */
export async function startFakeGateway() {
  const requests: GatewayRequest[] = [];
  /** Requests accepted (queued on the phone): the SMS really sent. */
  const accepted: GatewayRequest[] = [];
  const ids = new Set<string>();
  let status = 202;
  let delayMs = 0;
  let down = false;
  const held = new Set<import("node:http").ServerResponse>();
  let onRequest: ((request: GatewayRequest) => Promise<void>) | null = null;
  const server: Server = createHttpServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", async () => {
      const recorded = {
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: request.headers.authorization ?? "",
        body: JSON.parse(body || "null"),
      };
      requests.push(recorded);
      if (down) {
        // Phone off or out of the network: never answers, sends nothing.
        held.add(response);
        return;
      }
      try {
        await onRequest?.(recorded);
      } catch {
        // Assertions are checked by the test afterwards.
      }
      const id = (recorded.body as { id?: unknown } | null)?.id;
      let answer = status;
      if (typeof id === "string" && ids.has(id)) {
        answer = 409;
      } else if (status >= 200 && status < 300) {
        // Queued on the phone now, even if the answer comes too late.
        if (typeof id === "string") ids.add(id);
        accepted.push(recorded);
      }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      response.writeHead(answer, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify(
          answer === 409
            ? { message: "Message with the same ID already exists" }
            : { id: "x", state: "Pending" },
        ),
      );
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    accepted,
    /** Phone unreachable (never answers) or back. */
    setDown(value: boolean) {
      down = value;
      if (!value) {
        for (const response of held) response.destroy();
        held.clear();
      }
    },
    answerWith(code: number) {
      status = code;
    },
    /** Answers each request after `ms` milliseconds (slow phone). */
    delayAnswers(ms: number) {
      delayMs = ms;
    },
    /** Runs `callback` on each request, before answering it. */
    onRequest(callback: ((request: GatewayRequest) => Promise<void>) | null) {
      onRequest = callback;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        for (const response of held) response.destroy();
        server.close(() => resolve());
      }),
  };
}

/** TCP server accepting connections and never answering (phone asleep). */
export async function startSilentGateway() {
  const sockets = new Set<Socket>();
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

export interface Mail {
  from: string;
  to: string[];
  data: string;
}

/** Minimal SMTP server (no TLS, no auth) recording the mails. */
export async function startFakeSmtp() {
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
