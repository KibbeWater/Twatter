import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { getServerAuthSession } from "~/server/auth";
import { prisma } from "~/server/db";
import { ratelimits } from "~/server/ratelimits";
import { isPremium } from "~/utils/user";

async function createPost(req: NextApiRequest, res: NextApiResponse) {
    const session = await getServerAuthSession({ req, res });
    if (!session) return res.status(401).send({ message: "Unauthorized" });

    // Verify the body of the request,
    const bodyShape = z.object({
        content: z.string().min(1),
        parent: z.string().optional(),
        quote: z.string().optional(),
        images: z.array(z.string()).optional(),
    });

    // is it invalid?
    const body = bodyShape.safeParse(req.body);
    if (!body.success)
        return res
            .status(400)
            .send({ success: false, message: body.error.message });

    const { content, parent, quote, images } = body.data;

    if (!(await ratelimits.post.create.regular.limit(session.user.id)).success)
        return res.status(429).send({ success: false, message: "Ratelimited" });

    if (!isPremium(session.user) && content.length > 300)
        return res.status(400).send({
            success: false,
            message: "Posts are limited to 300 characters for free users",
        });

    if (isPremium(session.user) && content.length > 1000)
        return res.status(400).send({
            success: false,
            message: "Posts are limited to 1000 characters",
        });

    const newPost = await prisma.post.create({
        data: {
            content,
            userId: session.user.id,
            parentId: parent,
            quoteId: quote,
            images,
        },
        select: apiPostShape,
    });

    return res.status(200).send({
        success: true,
        data: newPost,
    });
}

async function getPosts(req: NextApiRequest, res: NextApiResponse) {
    const bodyShape = z.union([
        z
            .object({
                id: z.string().optional(),
                name: z.string().optional(),
                tag: z.string().optional(),
                parent: z.string().optional(),
                limit: z
                    .string()
                    .optional()
                    .transform((value) => Number(value))
                    .refine((value) => !isNaN(value), {
                        message: "Size must be a number",
                    }),
            })
            .refine(
                (data) =>
                    Object.entries(data).some(
                        ([key, value]) => value != null && key != "limit",
                    ),
                {
                    message: "At least one field must be non-null",
                },
            ),
        z.object({
            page: z
                .string()
                .transform((value) => Number(value))
                .refine((value) => !isNaN(value), {
                    message: "Size must be a number",
                }),
            limit: z
                .string()
                .optional()
                .transform((value) => Number(value))
                .refine((value) => !isNaN(value), {
                    message: "Size must be a number",
                }),
        }),
    ]);

    const body = bodyShape.safeParse(req.query);
    if (!body.success)
        return res
            .status(400)
            .send({ success: false, message: body.error.message });

    const input = body.data;

    if ("page" in input) {
        return res.status(200).send({
            success: true,
            data: await prisma.post.findMany({
                take: input.limit,
                skip: input.page * (input.limit ?? 10),
                orderBy: {
                    createdAt: "desc",
                },
                select: apiPostShape,
            }),
        });
    } else
        return res.status(200).send({
            success: true,
            data: await prisma.post.findMany({
                where: {
                    OR: [
                        input.id
                            ? {
                                  user: {
                                      id: input.id,
                                  },
                              }
                            : {},
                        input.name
                            ? {
                                  user: {
                                      name: input.name,
                                  },
                              }
                            : {},
                        input.tag
                            ? {
                                  user: {
                                      tag: input.tag,
                                  },
                              }
                            : {},
                        input.parent
                            ? {
                                  parent: {
                                      id: input.parent,
                                  },
                              }
                            : {},
                    ],
                },
                take: input.limit ?? 10,
                orderBy: {
                    createdAt: "desc",
                },
                select: apiPostShape,
            }),
        });
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    switch (req.method) {
        case "POST":
            return await createPost(req, res);
        case "GET":
            return await getPosts(req, res);
        default:
            return res.status(405).send({ message: "Method not allowed" });
    }
}

export const apiRoleShape = {
    id: true,
    name: true,
    permissions: true,
    createdAt: true,
    updatedAt: true,
};

export const apiPublicUserShape = {
    id: true,
    name: true,
    tag: true,
    bio: true,
    banner: true,
    image: true,
    verified: true,
    protected: true,
    permissions: true,
    roles: {
        select: apiRoleShape,
    },
    followerIds: true,
    followingIds: true,
};

export const apiFullUserShape = {
    ...apiPublicUserShape,
    email: true,
    lastTagReset: true,
};

export const apiPostShape = {
    id: true,
    content: true,
    user: {
        select: apiPublicUserShape,
    },
    comments: {
        select: {
            id: true,
            content: true,
            user: {
                select: apiPublicUserShape,
            },
            parent: {
                select: {
                    user: {
                        select: apiPublicUserShape,
                    },
                    id: true,
                    content: true,
                    quote: {
                        select: {
                            user: {
                                select: apiPublicUserShape,
                            },
                            id: true,
                            content: true,
                            likeIDs: true,
                            images: true,
                            videos: true,
                            createdAt: true,
                        },
                    },
                    likeIDs: true,
                    images: true,
                    videos: true,
                    createdAt: true,
                },
            },
            quote: {
                select: {
                    user: {
                        select: apiPublicUserShape,
                    },
                    id: true,
                    content: true,
                    likeIDs: true,
                    images: true,
                    videos: true,
                    createdAt: true,
                },
            },
            likeIDs: true,
            images: true,
            videos: true,
            createdAt: true,
        },
    },
    parent: {
        select: {
            user: {
                select: apiPublicUserShape,
            },
            id: true,
            content: true,
            parent: {
                select: {
                    user: {
                        select: apiPublicUserShape,
                    },
                    id: true,
                    content: true,
                    parent: {
                        select: {
                            user: {
                                select: apiPublicUserShape,
                            },
                            id: true,
                            content: true,
                            quote: {
                                select: {
                                    user: {
                                        select: apiPublicUserShape,
                                    },
                                    id: true,
                                    content: true,
                                    likeIDs: true,
                                    images: true,
                                    videos: true,
                                    createdAt: true,
                                },
                            },
                            likeIDs: true,
                            images: true,
                            videos: true,
                            createdAt: true,
                        },
                    },
                    quote: {
                        select: {
                            user: {
                                select: apiPublicUserShape,
                            },
                            id: true,
                            content: true,
                            likeIDs: true,
                            images: true,
                            videos: true,
                            createdAt: true,
                        },
                    },
                    likeIDs: true,
                    images: true,
                    videos: true,
                    createdAt: true,
                },
            },
            quote: {
                select: {
                    user: {
                        select: apiPublicUserShape,
                    },
                    id: true,
                    content: true,
                    likeIDs: true,
                    images: true,
                    videos: true,
                    createdAt: true,
                },
            },
            likeIDs: true,
            images: true,
            videos: true,
            createdAt: true,
        },
    },
    quote: {
        select: {
            user: {
                select: apiPublicUserShape,
            },
            id: true,
            content: true,
            likeIDs: true,
            images: true,
            videos: true,
            createdAt: true,
        },
    },
    likeIDs: true,
    images: true,
    videos: true,
    createdAt: true,
};
