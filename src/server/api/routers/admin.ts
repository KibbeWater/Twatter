import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PERMISSIONS, hasPermission } from "~/utils/permission";

export const adminRouter = createTRPCRouter({
    setUserVerification: protectedProcedure
        .input(
            z.object({
                id: z.number(),
                shouldVerify: z.boolean(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { id: userId, shouldVerify } = input;

            if (
                !hasPermission(
                    ctx.session.user,
                    PERMISSIONS.MANAGE_USERS_EXTENDED,
                )
            ) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message:
                        "You don't have sufficient permissions to perform this action.",
                    cause: "User lacks the MANAGE_USERS_EXTENDED permission.",
                });
            }

            return await ctx.prisma.user.update({
                where: {
                    id: userId,
                },
                data: {
                    verified: shouldVerify,
                },
            });
        }),
    setUserTagCooldown: protectedProcedure
        .input(
            z.object({
                id: z.number(),
                newDate: z.date(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { id: userId, newDate } = input;

            if (!hasPermission(ctx.session.user, PERMISSIONS.MANAGE_USERS)) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message:
                        "You don't have sufficient permissions to perform this action.",
                    cause: "User lacks the MANAGE_USERS permission.",
                });
            }

            return await ctx.prisma.user.update({
                where: {
                    id: userId,
                },
                data: {
                    lastTagReset: newDate,
                },
            });
        }),

    getUser: protectedProcedure
        .input(
            z.object({
                id: z.number(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { id: userId } = input;

            if (!hasPermission(ctx.session.user, PERMISSIONS.MANAGE_USERS)) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message:
                        "You don't have sufficient permissions to perform this action.",
                    cause: "User lacks the MANAGE_USERS permission.",
                });
            }

            return await ctx.prisma.user.findUnique({
                where: {
                    id: userId,
                },
            });
        }),

    updateUserPermissions: protectedProcedure
        .input(
            z.object({
                id: z.number(),
                permissions: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { id: userId, permissions: _permString } = input;

            const permissions = BigInt(_permString);

            if (
                !hasPermission(ctx.session.user, PERMISSIONS.MANAGE_USER_ROLES)
            ) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message:
                        "You don't have sufficient permissions to perform this action.",
                    cause: "User lacks the MANAGE_USER_ROLES permission.",
                });
            }

            const user = await ctx.prisma.user.findUnique({
                where: {
                    id: userId,
                },
            });

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found.",
                    cause: "User with the specified ID does not exist.",
                });
            }

            // Make sure the user doesn't have the administrator permission
            if (
                hasPermission(user, PERMISSIONS.ADMINISTRATOR) &&
                user.id !== ctx.session.user.id
            ) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You cannot change the permissions of this user.",
                    cause: "User has the ADMINISTRATOR permission.",
                });
            }

            // Make sure we aren't changing the administrator permission
            if (
                hasPermission(
                    { permissions: permissions.toString() },
                    PERMISSIONS.ADMINISTRATOR,
                ) !== hasPermission(user, PERMISSIONS.ADMINISTRATOR)
            ) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You cannot change the ADMINISTRATOR permission.",
                    cause: "You cannot change the ADMINISTRATOR permission.",
                });
            }

            return await ctx.prisma.user.update({
                where: {
                    id: userId,
                },
                data: {
                    permissions: permissions.toString(),
                },
            });
        }),
});
