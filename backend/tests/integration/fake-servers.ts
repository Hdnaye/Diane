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

/** HTTP server answering like SMS Gateway for Android, recording requests. */
export async function startFakeGateway() {
  const requests: GatewayRequest[] = [];
  let status = 202;
  let delayMs = 0;
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
      try {
        await onRequest?.(recorded);
      } catch {
        // Assertions are checked by the test afterwards.
      }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    /** Answers each request after `ms` milliseconds (slow phone). */
    delayAnswers(ms: number) {
      delayMs = ms;
    },
    /** Runs `callback` on each request, before answering it. */
    onRequest(callback: ((request: GatewayRequest) => Promise<void>) | null) {
      onRequest = callback;
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
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
