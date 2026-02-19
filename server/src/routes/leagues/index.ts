import { FastifyInstance } from "fastify";
import { registerLeagueCrudRoutes } from "./crud";
import { registerLeagueImportRoutes } from "./import";
import { registerLeagueMembershipRoutes } from "./membership";

export async function registerLeagueRoutes(server: FastifyInstance) {
  await registerLeagueCrudRoutes(server);
  await registerLeagueMembershipRoutes(server);
  await registerLeagueImportRoutes(server);
}
