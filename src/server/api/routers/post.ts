import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "~/server/api/trpc";

export const postRouter = createTRPCRouter({
    // DEPRECATED
    /* getPage: publicProcedure
        .input(
            z.object({ page: z.number().min(0), limit: z.number().optional() }),
        )
        .query(async ({ ctx, input }) => {
            const [posts, count] = await ctx.prisma.$transaction([
                ctx.prisma.post.findMany({
                    take: input.limit ?? 10,
                    skip: input.page * (input.limit ?? 10),
                    orderBy: { createdAt: "desc" },
                }),
                ctx.prisma.post.count(),
            ]);

            return {
                posts: posts,
                meta: {
                    totalPages: count,
                    page: input.page,
                    limit: input.limit ?? 10,
                },
            };
        }), */

    getPage: publicProcedure
        .input(
            z.object({
                limit: z.number().optional(),
                cursor: z.string().nullish(),
                skip: z.number().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { limit, skip, cursor } = input;
            const items = await ctx.prisma.post.findMany({
                take: (limit ?? 10) + 1,
                skip: skip,
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: {
                    createdAt: "desc",
                },
                where: {
                    parent: null,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                            role: true,
                            verified: true,
                            image: true,
                        },
                    },
                    quote: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    tag: true,
                                    role: true,
                                    verified: true,
                                    image: true,
                                },
                            },
                            comments: {
                                select: {
                                    id: true,
                                },
                            },
                            reposts: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                    comments: {
                        select: {
                            id: true,
                        },
                    },
                    reposts: {
                        select: {
                            id: true,
                        },
                    },
                },
            });
            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > (limit ?? 10)) {
                const nextItem = items.pop();
                nextCursor = nextItem?.id;
            }
            return {
                items,
                nextCursor,
            };
        }),

    getPost: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const userSelect = {
                select: {
                    id: true,
                    name: true,
                    tag: true,
                    role: true,
                    verified: true,
                    image: true,
                },
            };

            const post = await ctx.prisma.post.findUnique({
                where: { id: input.id },
                include: {
                    user: userSelect,
                    quote: {
                        include: {
                            user: userSelect,
                        },
                    },
                    comments: {
                        select: {
                            id: true,
                        },
                    },
                    reposts: {
                        select: {
                            id: true,
                        },
                    },
                    parent: {
                        include: {
                            user: userSelect,
                            quote: {
                                include: {
                                    user: userSelect,
                                    comments: {
                                        select: {
                                            id: true,
                                        },
                                    },
                                    reposts: {
                                        select: {
                                            id: true,
                                        },
                                    },
                                },
                            },
                            parent: {
                                include: {
                                    user: userSelect,
                                    quote: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!post) return null;

            return post;
        }),

    getCommentPage: publicProcedure
        .input(
            z.object({
                id: z.string(),
                limit: z.number().optional(),
                cursor: z.string().nullish(),
                skip: z.number().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { limit, skip, cursor } = input;
            const items = await ctx.prisma.post.findMany({
                take: (limit ?? 10) + 1,
                skip: skip,
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: {
                    createdAt: "desc",
                },
                where: {
                    parentId: input.id,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                            role: true,
                            verified: true,
                            image: true,
                        },
                    },
                    quote: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    tag: true,
                                    role: true,
                                    verified: true,
                                    image: true,
                                },
                            },
                            comments: {
                                select: {
                                    id: true,
                                },
                            },
                            reposts: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                    comments: {
                        select: {
                            id: true,
                        },
                    },
                    reposts: {
                        select: {
                            id: true,
                        },
                    },
                },
            });
            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > (limit ?? 10)) {
                const nextItem = items.pop();
                nextCursor = nextItem?.id;
            }
            return {
                items,
                nextCursor,
            };
        }),

    create: protectedProcedure
        .input(
            z.object({
                content: z.string().min(1),
                parent: z.string().optional(),
                quote: z.string().optional(),
                images: z.array(z.string()).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            return ctx.prisma.post.create({
                data: {
                    content: input.content,
                    userId: ctx.session.user.id,
                    parentId: input.parent,
                    quoteId: input.quote,
                    images: input.images,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            tag: true,
                            role: true,
                            verified: true,
                            image: true,
                        },
                    },
                    quote: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    tag: true,
                                    role: true,
                                    verified: true,
                                    image: true,
                                },
                            },
                            comments: {
                                select: {
                                    id: true,
                                },
                            },
                            reposts: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                    comments: {
                        select: {
                            id: true,
                        },
                    },
                    reposts: {
                        select: {
                            id: true,
                        },
                    },
                },
            });
        }),

    setLike: protectedProcedure
        .input(z.object({ postId: z.string(), shouldLike: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { postId: id, shouldLike } = input;
            return await ctx.prisma.post.update({
                where: { id },
                data: {
                    likes: {
                        connect: shouldLike
                            ? {
                                  id: ctx.session.user.id,
                              }
                            : undefined,
                        disconnect: !shouldLike
                            ? {
                                  id: ctx.session.user.id,
                              }
                            : undefined,
                    },
                },
            });
        }),
});
