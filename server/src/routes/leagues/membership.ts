import { compare } from "bcryptjs";
import { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../config/supabase";
import { authMiddleware } from "../../middleware/auth";
import {
  joinLeagueBodySchema,
  leagueIdParamsSchema,
  leagueMemberParamsSchema,
} from "./schemas";

export async function registerLeagueMembershipRoutes(server: FastifyInstance) {
  // POST /api/leagues/:id/join - Join league
  server.post(
    "/api/leagues/:id/join",
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

      const parsedBody = joinLeagueBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedBody.error.issues,
        });
      }

      const leagueId = parsedParams.data.id;

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .select("id, access_type, password_hash, max_members")
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      const targetStatus =
        league.access_type === "APPROVAL" ? "PENDING" : "APPROVED";

      const { data: existingMembership, error: existingMembershipError } =
        await supabaseAdmin
          .from("league_members")
          .select("id, status, role")
          .eq("league_id", leagueId)
          .eq("user_id", request.user.id)
          .maybeSingle();

      if (existingMembershipError) {
        request.log.error(
          { err: existingMembershipError },
          "Failed to load existing membership",
        );
        return reply.code(500).send({ error: "LEAGUE_JOIN_FAILED" });
      }

      if (league.access_type === "PASSWORD") {
        const providedPassword = parsedBody.data.password;
        if (!providedPassword) {
          return reply.code(400).send({ error: "PASSWORD_REQUIRED" });
        }

        const isValidPassword =
          typeof league.password_hash === "string" &&
          (await compare(providedPassword, league.password_hash));

        if (!isValidPassword) {
          return reply.code(403).send({ error: "INVALID_LEAGUE_PASSWORD" });
        }
      }

      if (targetStatus === "APPROVED") {
        const { count: approvedCount, error: countError } = await supabaseAdmin
          .from("league_members")
          .select("id", { count: "exact", head: true })
          .eq("league_id", leagueId)
          .eq("status", "APPROVED");

        if (countError) {
          request.log.error(
            { err: countError },
            "Failed to count approved members",
          );
          return reply.code(500).send({ error: "LEAGUE_JOIN_FAILED" });
        }

        const maxMembers =
          typeof league.max_members === "number" ? league.max_members : 12;
        const alreadyApproved = existingMembership?.status === "APPROVED";

        if (!alreadyApproved && (approvedCount ?? 0) >= maxMembers) {
          return reply.code(409).send({ error: "LEAGUE_FULL" });
        }
      }

      if (!existingMembership) {
        const { data: createdMembership, error: createError } =
          await supabaseAdmin
            .from("league_members")
            .insert({
              league_id: leagueId,
              user_id: request.user.id,
              role: "USER",
              status: targetStatus,
            })
            .select("id, league_id, user_id, role, status, joined_at")
            .single();

        if (createError || !createdMembership) {
          request.log.error(
            { err: createError },
            "Failed to create league membership",
          );
          return reply.code(500).send({ error: "LEAGUE_JOIN_FAILED" });
        }

        return reply.code(201).send({ membership: createdMembership });
      }

      const isAdmin = existingMembership.role === "ADMIN";
      const nextStatus = isAdmin ? existingMembership.status : targetStatus;

      const { data: updatedMembership, error: updateError } =
        await supabaseAdmin
          .from("league_members")
          .update({ status: nextStatus })
          .eq("id", existingMembership.id)
          .select("id, league_id, user_id, role, status, joined_at")
          .single();

      if (updateError || !updatedMembership) {
        request.log.error(
          { err: updateError },
          "Failed to update league membership",
        );
        return reply.code(500).send({ error: "LEAGUE_JOIN_FAILED" });
      }

      return reply.send({ membership: updatedMembership });
    },
  );

  // POST /api/leagues/:id/members/:memberId/approve - Approve member (admin only)
  server.post(
    "/api/leagues/:id/members/:memberId/approve",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedParams = leagueMemberParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedParams.error.issues,
        });
      }

      const { id: leagueId, memberId } = parsedParams.data;

      const { data: league, error: leagueError } = await supabaseAdmin
        .from("leagues")
        .select("id, admin_id, max_members")
        .eq("id", leagueId)
        .single();

      if (leagueError || !league) {
        return reply.code(404).send({ error: "LEAGUE_NOT_FOUND" });
      }

      if (league.admin_id !== request.user.id) {
        return reply.code(403).send({ error: "FORBIDDEN_ADMIN_ONLY" });
      }

      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("league_members")
        .select("id, league_id, user_id, role, status, joined_at")
        .eq("id", memberId)
        .eq("league_id", leagueId)
        .single();

      if (membershipError || !membership) {
        return reply.code(404).send({ error: "MEMBER_NOT_FOUND" });
      }

      if (membership.role === "ADMIN") {
        return reply.code(400).send({ error: "CANNOT_APPROVE_ADMIN" });
      }

      if (membership.status !== "APPROVED") {
        const { count: approvedCount, error: countError } = await supabaseAdmin
          .from("league_members")
          .select("id", { count: "exact", head: true })
          .eq("league_id", leagueId)
          .eq("status", "APPROVED");

        if (countError) {
          request.log.error(
            { err: countError },
            "Failed to count approved members during approval",
          );
          return reply.code(500).send({ error: "MEMBER_APPROVAL_FAILED" });
        }

        const maxMembers =
          typeof league.max_members === "number" ? league.max_members : 12;
        if ((approvedCount ?? 0) >= maxMembers) {
          return reply.code(409).send({ error: "LEAGUE_FULL" });
        }
      }

      const { data: updatedMembership, error: updateError } =
        await supabaseAdmin
          .from("league_members")
          .update({ status: "APPROVED" })
          .eq("id", membership.id)
          .select("id, league_id, user_id, role, status, joined_at")
          .single();

      if (updateError || !updatedMembership) {
        request.log.error({ err: updateError }, "Failed to approve member");
        return reply.code(500).send({ error: "MEMBER_APPROVAL_FAILED" });
      }

      return reply.send({ membership: updatedMembership });
    },
  );

  // POST /api/leagues/:id/members/:memberId/reject - Reject member (admin only)
  server.post(
    "/api/leagues/:id/members/:memberId/reject",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedParams = leagueMemberParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedParams.error.issues,
        });
      }

      const { id: leagueId, memberId } = parsedParams.data;

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

      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("league_members")
        .select("id, league_id, user_id, role, status, joined_at")
        .eq("id", memberId)
        .eq("league_id", leagueId)
        .single();

      if (membershipError || !membership) {
        return reply.code(404).send({ error: "MEMBER_NOT_FOUND" });
      }

      if (membership.role === "ADMIN") {
        return reply.code(400).send({ error: "CANNOT_REJECT_ADMIN" });
      }

      const { data: updatedMembership, error: updateError } =
        await supabaseAdmin
          .from("league_members")
          .update({ status: "REJECTED" })
          .eq("id", membership.id)
          .select("id, league_id, user_id, role, status, joined_at")
          .single();

      if (updateError || !updatedMembership) {
        request.log.error({ err: updateError }, "Failed to reject member");
        return reply.code(500).send({ error: "MEMBER_REJECTION_FAILED" });
      }

      return reply.send({ membership: updatedMembership });
    },
  );

  // DELETE /api/leagues/:id/members/:memberId - Remove member (admin only)
  server.delete(
    "/api/leagues/:id/members/:memberId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const parsedParams = leagueMemberParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          details: parsedParams.error.issues,
        });
      }

      const { id: leagueId, memberId } = parsedParams.data;

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

      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("league_members")
        .select("id, league_id, user_id, role, status, joined_at")
        .eq("id", memberId)
        .eq("league_id", leagueId)
        .single();

      if (membershipError || !membership) {
        return reply.code(404).send({ error: "MEMBER_NOT_FOUND" });
      }

      if (membership.role === "ADMIN") {
        return reply.code(400).send({ error: "CANNOT_REMOVE_ADMIN" });
      }

      const { error: deleteError } = await supabaseAdmin
        .from("league_members")
        .delete()
        .eq("id", membership.id)
        .eq("league_id", leagueId);

      if (deleteError) {
        request.log.error({ err: deleteError }, "Failed to remove member");

        if (deleteError.code === "23503") {
          return reply.code(409).send({
            error: "MEMBER_REMOVE_CONFLICT",
            message:
              "Member cannot be removed because related records still reference it",
          });
        }

        return reply.code(500).send({ error: "MEMBER_REMOVE_FAILED" });
      }

      return reply.send({ removed: true, memberId: membership.id });
    },
  );
}
