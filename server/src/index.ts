import cors from "@fastify/cors";
import dotenv from "dotenv";
import Fastify from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { authMiddleware } from "./middleware/auth"; // Importa il middleware
import { registerAuctionSocket } from "./socket/auction";

dotenv.config();

const server = Fastify({ logger: true });
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:4200"];

server.register(cors, { origin: corsOrigins });

const io = new SocketIOServer(server.server, {
  cors: {
    origin: corsOrigins,
  },
});

registerAuctionSocket(io);

// Rotta pubblica
server.get("/", async (req, reply) => {
  return { status: "OK", message: "FantaBid Server is running 🚀" };
});

// Rotta PROTETTA (Richiede Login)
server.get(
  "/protected",
  { preHandler: [authMiddleware] },
  async (req, reply) => {
    // Se arriviamo qui, req.user è popolato
    return {
      message: "Sei autenticato!",
      user: req.user,
    };
  },
);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3000");
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
