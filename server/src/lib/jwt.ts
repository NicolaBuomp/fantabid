import dotenv from "dotenv";
import jwt, { JwtPayload } from "jsonwebtoken";

dotenv.config();

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("MISSING SUPABASE_JWT_SECRET in .env");
}

function getJwtSecret(): string {
  return JWT_SECRET!;
}

export type AuthUser = {
  id: string;
  role: string;
  email?: string;
};

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function verifySupabaseJwt(token: string): AuthUser {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    clockTolerance: 30,
  }) as JwtPayload;

  const subject = decoded.sub;
  if (!subject) {
    throw new Error("INVALID_TOKEN_SUB");
  }

  return {
    id: subject,
    role: String(decoded.role ?? "authenticated"),
    email: decoded.email ? String(decoded.email) : undefined,
  };
}
