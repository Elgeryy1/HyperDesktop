import net from "node:net";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { validateRemoteConsoleSession } from "./remote-console.store.js";

const remoteConsoleWsServer = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false
});

export function bindRemoteConsoleWsProxy(server: Server): void {
  server.on("upgrade", (request, socket, head) => {
    const upgrade = request.headers.upgrade?.toLowerCase();
    if (upgrade !== "websocket") {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    const parsed = parseUpgradeRequest(request);
    if (!parsed) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const session = validateRemoteConsoleSession({
      id: parsed.sessionId,
      token: parsed.token,
      protocol: "VNC"
    });
    if (!session) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    remoteConsoleWsServer.handleUpgrade(request, socket, head, (ws) => {
      const tcpSocket = net.createConnection({
        host: session.targetHost,
        port: session.targetPort
      });

      tcpSocket.on("data", (chunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk, { binary: true });
        }
      });

      tcpSocket.on("error", () => {
        if (ws.readyState === ws.OPEN) {
          ws.close(1011, "Unable to connect VNC target");
        }
      });

      tcpSocket.on("close", () => {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          ws.close();
        }
      });

      ws.on("message", (payload, isBinary) => {
        if (tcpSocket.destroyed) {
          return;
        }
        if (isBinary) {
          tcpSocket.write(payload as Buffer);
        } else {
          tcpSocket.write(Buffer.from(payload.toString(), "utf8"));
        }
      });

      ws.on("close", () => {
        if (!tcpSocket.destroyed) {
          tcpSocket.end();
        }
      });

      ws.on("error", () => {
        if (!tcpSocket.destroyed) {
          tcpSocket.destroy();
        }
      });
    });
  });
}

function parseUpgradeRequest(request: IncomingMessage): { sessionId: string; token: string } | null {
  const requestUrl = request.url ?? "";
  const url = new URL(requestUrl, "http://localhost");

  const match = url.pathname.match(/^\/api\/v1\/remote-console\/sessions\/([0-9a-f-]{36})\/vnc(?:\/([a-z0-9]+))?$/i);
  if (!match) {
    return null;
  }

  const token = match[2] ?? url.searchParams.get("token") ?? "";
  if (!token) {
    return null;
  }

  return {
    sessionId: match[1],
    token
  };
}

function rejectUpgrade(socket: Duplex, statusCode: number, reason: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
