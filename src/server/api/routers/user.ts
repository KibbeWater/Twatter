import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { postShape } from "~/server/api/routers/post";

import {
    createTRPCRouter,
    publicProcedure,
    protectedProcedure,
} from "~/server/api/trpc";
import {
    PERMISSIONS,
    addPermission,
    hasPermission,
    removePermission,
} from "~/utils/permission";
import { isPremium } from "~/utils/user";

// TODO: Check over literally this entire fucking file
export const userRouter = createTRPCRouter({
    getProfile: publicProcedure
        .input(
            z.object({ tag: z.string().optional(), id: z.string().optional() }),
        )
        .query(async ({ ctx, input }) => {
            const { tag, id } = input;

            if (!tag && !id)
                throw new TRPCError({
                    code: "PARSE_ERROR",
                    message: "Please select at least a tag or id",
                    cause: "Missing id or tag",
                });

            const user = await ctx.prisma.user.findUnique({
                where: {
                    tag,
                    id,
                },
                select: {
                    id: true,
                    name: true,
                    bio: true,
                    tag: true,
                    permissions: true,
                    roles: {
                        select: {
                            id: true,
                            permissions: true,
                        },
                    },
                    protected: true,
                    verified: true,
                    image: true,
                    banner: true,
                    posts: {
                        orderBy: {
                            createdAt: "desc",
                        },
                        where: {
                            parent: null,
                        },
                        include: postShape,
                    },
                    followers: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                        },
                    },
                    following: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                        },
                    },
                    followerIds: true,
                    followingIds: true,
                },
            });

            if (!user)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message:
                        "User not found. Please check the tag and try again.",
                    cause: "User not found",
                });

            const HIDE_FOLLOWINGS =
                hasPermission(user, PERMISSIONS.HIDE_FOLLOWINGS) &&
                isPremium(user);
            const HIDE_POSTS =
                hasPermission(user, PERMISSIONS.HIDE_POSTS) && isPremium(user);

            return {
                ...user,
                followerIds: !HIDE_FOLLOWINGS ? user.followerIds : [],
                followingIds: !HIDE_FOLLOWINGS ? user.followingIds : [],
                followers: !HIDE_FOLLOWINGS ? user.followers : [],
                following: !HIDE_FOLLOWINGS ? user.following : [],
                posts: !HIDE_POSTS ? user.posts : [],
            };
        }),
    findUsers: publicProcedure
        .input(z.object({ query: z.string() }))
        .query(async ({ ctx, input }) => {
            const users = await ctx.prisma.user.findMany({
                take: 10,
                where: {
                    OR: [
                        {
                            name: {
                                contains: input.query,
                                mode: "insensitive",
                            },
                        },
                        {
                            tag: {
                                contains: input.query,
                                mode: "insensitive",
                            },
                        },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    tag: true,
                    permissions: true,
                    verified: true,
                    image: true,
                    roles: {
                        select: {
                            id: true,
                            permissions: true,
                        },
                    },
                },
            });

            return users;
        }),
    updateProfile: protectedProcedure
        .input(
            z.object({
                name: z.string().optional(),
                bio: z.string().optional(),
                image: z.string().optional(),
                banner: z.string().optional(),
                tag: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            if (input.tag) {
                const tag = input.tag.toLowerCase();
                const tagExists = await ctx.prisma.user.findUnique({
                    where: { tag },
                });

                if (tagExists)
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Tag already exists.",
                        cause: "Tag already exists.",
                    });

                if (/^[a-zA-Z0-9_-]{3,16}$/.test(tag) === false)
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "The tag you provided is invalid.",
                        cause: "Invalid tag",
                    });

                const lastTagReset = new Date(ctx.session.user.lastTagReset);
                const now = new Date();
                const diff = now.getTime() - lastTagReset.getTime();

                const resetLength = isPremium(ctx.session.user)
                    ? 14 * 24 * 60 * 60 * 1000 // 14 days
                    : 30 * 24 * 60 * 60 * 1000; // 30 days

                if (diff > resetLength) {
                    return await ctx.prisma.user.update({
                        where: { id },
                        data: { tag, lastTagReset: now.toISOString() },
                    });
                } else
                    throw new TRPCError({
                        code: "TOO_MANY_REQUESTS",
                        message: `You can only change your tag once every ${
                            isPremium(ctx.session.user) ? "14 days" : "30 days"
                        }. Please try again in ${Math.round(
                            (resetLength - diff) / 1000 / 60 / 60,
                        )} hours.`,
                        cause: "Tag change cooldown",
                    });
            }
            return await ctx.prisma.user.update({ where: { id }, data: input });
        }),

    getFollowing: publicProcedure
        .input(
            z.object({
                id: z.string(),
                followType: z.literal("followers").or(z.literal("following")),
            }),
        )
        .query(async ({ ctx, input }) => {
            const user = await ctx.prisma.user.findUnique({
                where: {
                    id: input.id,
                },
                select: {
                    permissions: true,
                    roles: {
                        select: { id: true, permissions: true },
                    },
                    [input.followType]: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                            verified: true,
                            image: true,
                            followerIds: true,
                            followingIds: true,
                            permissions: true,
                            roles: {
                                select: {
                                    id: true,
                                    permissions: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!user)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found.",
                    cause: "User not found.",
                });

            if (
                hasPermission(
                    user as unknown as {
                        permissions: string;
                        roles: { permissions: string }[];
                    },
                    PERMISSIONS.HIDE_FOLLOWINGS,
                ) &&
                isPremium(
                    user as unknown as {
                        permissions: string;
                        roles: { id: string }[];
                    },
                )
            )
                return [];

            return user[input.followType];
        }),

    updateEmail: protectedProcedure
        .input(z.object({ email: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;
            const emailExists = await ctx.prisma.user.findUnique({
                where: { email: input.email },
            });

            if (emailExists)
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Email already exists.",
                    cause: "Email already exists.",
                });

            // TODO: Alert the old email holder that their email was changed

            return await ctx.prisma.user.update({
                where: { id },
                data: { email: input.email },
            });
        }),

    getLinkedAccounts: protectedProcedure
        .input(z.object({}))
        .query(async ({ ctx }) => {
            const { id } = ctx.session.user;

            const accounts = await ctx.prisma.account.findMany({
                where: {
                    userId: id,
                },
            });

            return accounts.map((a) => a.provider);
        }),

    unlinkAccount: protectedProcedure
        .input(z.object({ provider: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            const account = await ctx.prisma.account.findFirst({
                where: {
                    userId: id,
                    provider: input.provider,
                },
            });

            if (!account)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Account not found.",
                    cause: "Account not found.",
                });

            return await ctx.prisma.account.delete({
                where: {
                    id: account.id,
                },
            });
        }),

    getActiveSessions: protectedProcedure
        .input(z.object({}))
        .query(async ({ ctx }) => {
            const { id } = ctx.session.user;

            const sessions = await ctx.prisma.session.findMany({
                select: {
                    id: true,
                    userAgent: true,
                    expires: true,
                    lastAccessed: true,
                },
                where: {
                    userId: id,
                },
            });

            return sessions;
        }),

    logOutSessions: protectedProcedure
        .input(z.object({ sessions: z.array(z.string()) }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;
            const { sessions } = input;

            await ctx.prisma.session.deleteMany({
                where: {
                    userId: id,
                    id: {
                        in: sessions,
                    },
                },
            });

            return true;
        }),

    getSession: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            const session = await ctx.prisma.session.findFirst({
                where: {
                    userId: id,
                    id: input.id,
                },
                select: {
                    id: true,
                    userAgent: true,
                    expires: true,
                    lastAccessed: true,
                },
            });

            if (!session)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Session not found.",
                    cause: "Session not found.",
                });

            return session;
        }),

    setProtected: protectedProcedure
        .input(z.object({ protected: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            return await ctx.prisma.user.update({
                where: { id },
                data: { protected: input.protected },
            });
        }),

    setFollowingsProtected: protectedProcedure
        .input(z.object({ protected: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            const user = await ctx.prisma.user.findUnique({
                where: { id },
                select: {
                    permissions: true,
                    roles: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            if (!user)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found.",
                    cause: "User not found.",
                });

            if (!isPremium(user))
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You must be premium to hide your verification.",
                    cause: "Not premium.",
                });

            return await ctx.prisma.user.update({
                where: { id },
                data: {
                    permissions: input.protected
                        ? addPermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_FOLLOWINGS,
                          ).toString()
                        : removePermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_FOLLOWINGS,
                          ).toString(),
                },
            });
        }),

    setPostsProtected: protectedProcedure
        .input(z.object({ protected: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            const user = await ctx.prisma.user.findUnique({
                where: { id },
                select: {
                    permissions: true,
                    roles: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            if (!user)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found.",
                    cause: "User not found.",
                });

            if (!isPremium(user))
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You must be premium to hide your verification.",
                    cause: "Not premium.",
                });

            return await ctx.prisma.user.update({
                where: { id },
                data: {
                    permissions: input.protected
                        ? addPermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_POSTS,
                          ).toString()
                        : removePermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_POSTS,
                          ).toString(),
                },
            });
        }),

    setVerificationProtected: protectedProcedure
        .input(z.object({ protected: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = ctx.session.user;

            const user = await ctx.prisma.user.findUnique({
                where: { id },
                select: {
                    permissions: true,
                    roles: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            if (!user)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found.",
                    cause: "User not found.",
                });

            return await ctx.prisma.user.update({
                where: { id },
                data: {
                    permissions: input.protected
                        ? addPermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_VERIFICATION,
                          ).toString()
                        : removePermission(
                              { ...user, roles: [] },
                              PERMISSIONS.HIDE_VERIFICATION,
                          ).toString(),
                },
            });
        }),
});
