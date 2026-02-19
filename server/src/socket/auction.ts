import { Server } from "socket.io";
import { verifySupabaseJwt } from "../lib/jwt";

type TokenRefreshPayload = {
  token?: string;
};

type TokenRefreshAck = (response: {
  ok: boolean;
  error?: "MISSING_TOKEN" | "INVALID_TOKEN";
}) => void;

export function registerAuctionSocket(io: Server) {
  const auctionNamespace = io.of("/auction");

  auctionNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token) {
      return next(new Error("MISSING_TOKEN"));
    }

    try {
      socket.data.user = verifySupabaseJwt(token);
      return next();
    } catch {
      return next(new Error("INVALID_TOKEN"));
    }
  });

  auctionNamespace.on("connection", (socket) => {
    socket.on(
      "token_refresh",
      (payload: TokenRefreshPayload, ack?: TokenRefreshAck) => {
        if (!payload?.token) {
          ack?.({ ok: false, error: "MISSING_TOKEN" });
          return;
        }

        try {
          socket.data.user = verifySupabaseJwt(payload.token);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "INVALID_TOKEN" });
          socket.emit("auth_error", { error: "INVALID_TOKEN" });
        }
      },
    );
  });
}
