import { hash } from "bcryptjs";
import { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../config/supabase";
import { authMiddleware } from "../../middleware/auth";
import {
  createLeagueBodySchema,
  leagueIdParamsSchema,
  updateLeagueSettingsBodySchema,
} from "./schemas";
import { getDefaultSettings } from "./types";

export async function registerLeagueCrudRoutes(server: FastifyInstance) {
  // POST /api/leagues - Create league
  server.post(
    "/api/leagues",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedBody = createLeagueBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedBody.error.issues,
        });
      }

      const { name, mode, access_type, max_members, settings, password } =
        parsedBody.data;

      const passwordHash =
        access_type === "PASSWORD" && password
          ? await hash(password, 10)
          : null;

      const mergedSettings = {
        ...getDefaultSettings(mode),
        ...(settings ?? {}),
      };

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .insert({
          admin_id: request.user.id,
          name,
          mode,
          access_type,
          password_hash: passwordHash,
          max_members: max_members ?? 12,
          settings: mergedSettings,
        })
        .select(
          "id, admin_id, name, mode, access_type, status, max_members, settings, created_at, updated_at",
        )
        .single();

      if (leagueError || !league) {
        request.log.error({ err: leagueError }, "Failed to create league");
        return reply.code(500).send({ error: "LEAGUE_CREATE_FAILED" });
      }

      const baseBudget = mergedSettings.base_budget ?? 500;

      const { error: memberError } = await supabaseAdmin
        .from("league_members")
        .insert({
          league_id: league.id,
          user_id: request.user.id,
          status: "APPROVED",
          role: "ADMIN",
          budget_initial: baseBudget,
          budget_current: baseBudget,
        });

      if (memberError) {
        request.log.error(
          { err: memberError },
          "Failed to create admin membership",
        );
        await supabaseAdmin.from("leagues").delete().eq("id", league.id);
        return reply.code(500).send({ error: "LEAGUE_MEMBER_CREATE_FAILED" });
      }

      return reply.code(201).send({ league });
    },
  );

  // GET /api/leagues - List user's leagues
  server.get(
    "/api/leagues",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const { data, error } = await supabaseAdmin
        .from("league_members")
        .select(
          `
          id,
          league_id,
          role,
          status,
          joined_at,
          leagues (
            id,
            admin_id,
            name,
            mode,
            access_type,
            status,
            max_members,
            created_at,
            updated_at
          )
        `,
        )
        .eq("user_id", request.user.id)
        .order("joined_at", { ascending: false });

      if (error) {
        request.log.error({ err: error }, "Failed to fetch user leagues");
        return reply.code(500).send({ error: "LEAGUES_FETCH_FAILED" });
      }

      const leagues = (data ?? []).map((memberRecord) => ({
        membership: {
          id: memberRecord.id,
          league_id: memberRecord.league_id,
          role: memberRecord.role,
          status: memberRecord.status,
          joined_at: memberRecord.joined_at,
        },
        league: memberRecord.leagues,
      }));

      return reply.send({ leagues });
    },
  );

  // GET /api/leagues/:id - Get league detail
  server.get(
    "/api/leagues/:id",
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
        .select(
          "id, admin_id, name, mode, access_type, status, max_members, settings, created_at, updated_at",
        )
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      const { data: viewerMembership, error: viewerMembershipError } =
        await supabaseAdmin
          .from("league_members")
          .select(
            "id, league_id, user_id, role, status, team_name, budget_initial, budget_current, slots_filled",
          )
          .eq("league_id", leagueId)
          .eq("user_id", request.user.id)
          .maybeSingle();

      if (viewerMembershipError) {
        request.log.error(
          { err: viewerMembershipError },
          "Failed to load viewer membership",
        );
        return reply
          .code(500)
          .send({ error: "LEAGUE_MEMBERSHIP_FETCH_FAILED" });
      }

      if (!viewerMembership && league.access_type !== "OPEN") {
        return reply.code(403).send({ error: "FORBIDDEN" });
      }

      const { data: members, error: membersError } = await supabaseAdmin
        .from("league_members")
        .select(
          `
          id,
          league_id,
          user_id,
          role,
          status,
          team_name,
          budget_initial,
          budget_current,
          slots_filled,
          joined_at,
          profiles (
            id,
            username,
            avatar_url
          )
        `,
        )
        .eq("league_id", leagueId)
        .order("joined_at", { ascending: true });

      if (membersError) {
        request.log.error(
          { err: membersError },
          "Failed to load league members",
        );
        return reply.code(500).send({ error: "LEAGUE_MEMBERS_FETCH_FAILED" });
      }

      return reply.send({
        league,
        viewerMembership,
        members: members ?? [],
      });
    },
  );

  // PATCH /api/leagues/:id - Update league settings (admin only)
  server.patch(
    "/api/leagues/:id",
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

      const parsedBody = updateLeagueSettingsBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedBody.error.issues,
        });
      }

      const leagueId = parsedParams.data.id;

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .select(
          "id, admin_id, mode, settings, updated_at, name, access_type, status, max_members, created_at",
        )
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      if (league.admin_id !== request.user.id) {
        return reply.code(403).send({ error: "FORBIDDEN_ADMIN_ONLY" });
      }

      const nextSettings = {
        ...(league.settings ?? {}),
        ...parsedBody.data.settings,
      };

      const { data: updatedLeague, error: updateError } = await supabaseAdmin
        .from("leagues")
        .update({
          settings: nextSettings,
        })
        .eq("id", leagueId)
        .select(
          "id, admin_id, name, mode, access_type, status, max_members, settings, created_at, updated_at",
        )
        .single();

      if (updateError || !updatedLeague) {
        request.log.error(
          { err: updateError },
          "Failed to update league settings",
        );
        return reply.code(500).send({ error: "LEAGUE_SETTINGS_UPDATE_FAILED" });
      }

      return reply.send({ league: updatedLeague });
    },
  );
}
