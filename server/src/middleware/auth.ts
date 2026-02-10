import dotenv from "dotenv"; // <--- 1. Aggiungi questo import
import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

// 2. Carica le variabili immediatamente, prima di leggere JWT_SECRET
dotenv.config();

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("MISSING SUPABASE_JWT_SECRET in .env");
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.code(401).send({ error: "No Authorization header" });
  }

  // Formato atteso: "Bearer <token>"
  const token = authHeader.split(" ")[1];

  if (!token) {
    return reply.code(401).send({ error: "Missing Bearer token" });
  }

  try {
    // Verifica la firma del token usando il segreto condiviso
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    request.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
    };
  } catch (err) {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
