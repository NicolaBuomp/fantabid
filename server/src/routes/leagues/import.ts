import { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../config/supabase";
import { parseListone } from "../../lib/listone-parser";
import { authMiddleware } from "../../middleware/auth";
import {
  clearImportPreviewCache,
  getImportPreviewCache,
  setImportPreviewCache,
} from "../../services/import-preview-cache";
import { importConfirmBodySchema, leagueIdParamsSchema } from "./schemas";

export async function registerLeagueImportRoutes(server: FastifyInstance) {
  server.post(
    "/api/leagues/:id/players/import",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedParams = leagueIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedParams.error.issues,
        });
      }

      const leagueId = parsedParams.data.id;

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .select("id, admin_id")
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      if (league.admin_id !== request.user.id) {
        return reply.code(403).send({ error: "FORBIDDEN_ADMIN_ONLY" });
      }

      const file = await request.file();

      if (!file) {
        return reply.code(400).send({ error: "FILE_REQUIRED" });
      }

      const filename = (file.filename ?? "").toLowerCase();
      const mimetype = (file.mimetype ?? "").toLowerCase();
      const isXlsxFile =
        filename.endsWith(".xlsx") ||
        mimetype.includes("spreadsheetml") ||
        mimetype.includes("excel");

      if (!isXlsxFile) {
        return reply.code(400).send({ error: "INVALID_FILE_TYPE" });
      }

      const buffer = await file.toBuffer();

      let parsed;
      try {
        parsed = parseListone(buffer);
      } catch (error) {
        request.log.error({ err: error }, "Failed to parse listone file");
        return reply.code(400).send({
          error: "LISTONE_PARSE_FAILED",
          message:
            error instanceof Error ? error.message : "Unknown parser error",
        });
      }

      setImportPreviewCache({
        leagueId,
        userId: request.user.id,
        players: parsed.players,
      });

      return reply.send({
        preview: parsed.preview,
      });
    },
  );

  server.post(
    "/api/leagues/:id/players/import/confirm",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedParams = leagueIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedParams.error.issues,
        });
      }

      const parsedBody = importConfirmBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedBody.error.issues,
        });
      }

      const leagueId = parsedParams.data.id;
      const {
        team_mapping: teamMapping,
        overwrite_existing: overwriteExisting,
      } = parsedBody.data;

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .select("id, admin_id, status, settings")
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      if (league.admin_id !== request.user.id) {
        return reply.code(403).send({ error: "FORBIDDEN_ADMIN_ONLY" });
      }

      const previewCache = getImportPreviewCache(leagueId, request.user.id);
      if (!previewCache) {
        return reply.code(409).send({ error: "IMPORT_PREVIEW_EXPIRED" });
      }

      const { data: importedSummary, error: rpcError } =
        await supabaseAdmin.rpc("confirm_players_import_atomic", {
          p_league_id: leagueId,
          p_actor_id: request.user.id,
          p_overwrite_existing: overwriteExisting,
          p_players: previewCache.players,
          p_team_mapping: teamMapping,
        });

      if (rpcError) {
        request.log.error(
          { err: rpcError },
          "Import confirm atomic RPC failed",
        );

        const message = rpcError.message ?? "IMPORT_CONFIRM_FAILED";
        if (message.includes("PLAYERS_ALREADY_EXIST")) {
          return reply.code(409).send({ error: "PLAYERS_ALREADY_EXIST" });
        }

        if (message.includes("INVALID_TEAM_MAPPING_MEMBER")) {
          return reply.code(400).send({ error: "INVALID_TEAM_MAPPING_MEMBER" });
        }

        if (message.includes("FORBIDDEN_ADMIN_ONLY")) {
          return reply.code(403).send({ error: "FORBIDDEN_ADMIN_ONLY" });
        }

        if (message.includes("LEAGUE_NOT_FOUND")) {
          return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
        }

        if (
          message.includes("Could not find the function") ||
          message.includes("confirm_players_import_atomic")
        ) {
          return reply.code(500).send({
            error: "IMPORT_CONFIRM_RPC_MISSING",
            message:
              "Missing DB function confirm_players_import_atomic. Apply SQL migration first.",
          });
        }

        return reply.code(500).send({ error: "IMPORT_CONFIRM_FAILED" });
      }

      clearImportPreviewCache(leagueId, request.user.id);

      return reply.send({
        imported: importedSummary,
      });
    },
  );
}
