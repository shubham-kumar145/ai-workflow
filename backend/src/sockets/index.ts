import { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { env } from "../lib/env";
import { verifyToken } from "../lib/jwt";

let io: IOServer | null = null;

export function initSockets(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing token"));
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("project:subscribe", (projectId: string) => {
      socket.join(`project:${projectId}`);
    });
    socket.on("project:unsubscribe", (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

export function getIO(): IOServer | null {
  return io;
}
