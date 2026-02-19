import { FastifyReply, FastifyRequest } from "fastify";
import { extractBearerToken, verifySupabaseJwt } from "../lib/jwt";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = extractBearerToken(request.headers.authorization);

  if (!token) {
    return reply.code(401).send({ error: "MISSING_TOKEN" });
  }

  try {
    request.user = verifySupabaseJwt(token);
  } catch {
    return reply.code(401).send({ error: "INVALID_TOKEN" });
  }
}
