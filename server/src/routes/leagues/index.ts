import { FastifyInstance } from "fastify";
import { registerLeagueCrudRoutes } from "./crud";
import { registerLeagueMembershipRoutes } from "./membership";

export async function registerLeagueRoutes(server: FastifyInstance) {
  await registerLeagueCrudRoutes(server);
  await registerLeagueMembershipRoutes(server);
}
