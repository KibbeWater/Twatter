import { createTRPCRouter } from "~/server/api/trpc";

import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/ai";
import { followersRouter } from "./routers/followers";
import { migrateRouter } from "./routers/migrate";
import { notificationsRouter } from "./routers/notifications";
import { postRouter } from "./routers/post";
import { roleRouter } from "./routers/role";
import { s3Router } from "./routers/s3";
import { userRouter } from "./routers/user";
import { chatRouter } from "./routers/chat";
import { stripeRouter } from "./routers/stripe";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    admin: adminRouter,
    post: postRouter,
    user: userRouter,
    followers: followersRouter,
    notifications: notificationsRouter,
    s3: s3Router,
    migrate: migrateRouter,
    role: roleRouter,
    ai: aiRouter,
    chat: chatRouter,
    stripe: stripeRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
