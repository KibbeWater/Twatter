import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { render } from "@react-email/components";
import { type GetServerSidePropsContext } from "next";
import {
    getServerSession,
    type DefaultSession,
    type NextAuthOptions,
} from "next-auth";
import AppleProvider from "next-auth/providers/apple";
// import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvide from "next-auth/providers/google";
import { createTransport } from "nodemailer";

import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { isPremium } from "~/utils/user";

import MagicLink from "~/components/Mail/MagicLink";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
    interface Session extends DefaultSession {
        userAgent: string | null;
        user: {
            id: string;
            tag: string;
            roles: Role[];
            permissions: string;
            verified: boolean;
            lastTagReset: string;
            protected: boolean;
        } & DefaultSession["user"];
    }

    interface Role {
        id: string;
        name: string;
        permissions: string;
    }

    interface User {
        tag: string;
        roles: Role[];
        permissions: string;
        verified: boolean;
        lastTagReset: string;
        protected: boolean;
    }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
    callbacks: {
        signIn: async (user) => {
            const { name, image, id } = user.user;
            if (!name || !image)
                await prisma.user.update({
                    where: { id },
                    data: {
                        name: !name ? "User" : undefined,
                        image: !image
                            ? "/assets/imgs/default-avatar.png"
                            : undefined,
                    },
                });

            return true;
        },
        session: async ({ session, user }) => {
            // TODO: We probably should not do this, investigate later
            const usr = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    id: true,
                    roles: {
                        select: { id: true, name: true, permissions: true },
                    },
                    stripeCustomer: {
                        select: {
                            subscriptions: {
                                select: {
                                    status: true,
                                    startDate: true,
                                    endDate: true,
                                },
                            },
                        },
                    },
                },
            });

            await prisma.session.updateMany({
                where: { expires: session.expires },
                data: { lastAccessed: new Date() },
            });

            const hasActiveSubscription =
                usr?.stripeCustomer?.subscriptions.some(
                    (sub) =>
                        (sub.status === "active" ||
                            sub.status === "trialing") &&
                        sub.endDate > new Date() &&
                        sub.startDate < new Date(),
                );
            const hasPremiumRole = usr ? isPremium(usr) : false;

            if (hasActiveSubscription && !hasPremiumRole && usr)
                await prisma.user.update({
                    where: { id: usr.id },
                    data: { roles: { connect: { id: env.PREMIUM_ROLE_ID } } },
                });
            else if (!hasActiveSubscription && hasPremiumRole && usr)
                await prisma.user.update({
                    where: { id: usr.id },
                    data: {
                        roles: { disconnect: { id: env.PREMIUM_ROLE_ID } },
                    },
                });

            return {
                ...session,
                user: {
                    ...session.user,
                    id: user.id,
                    tag: user.tag,
                    lastTagReset: user.lastTagReset,
                    roles: usr?.roles ?? [],
                    verified: user.verified,
                    permissions: user.permissions,
                },
            };
        },
    },
    adapter: PrismaAdapter(prisma),
    providers: [
        /* CredentialsProvider({
            id: "migration_login",
            name: "Migrated Credentials",

            credentials: {
                newEmail: { label: "New Email", type: "email" },
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },

            // fuck you NextAuth, genuinely, fuck you
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            authorize: async (credentials, _) => {
                try {
                    const { newEmail, username, password } =
                        credentialsSchema.parse(credentials);

                    // Since cred logins will only be for migration, we can apply the migration function to do the same transformation done on migration
                    const fixTags = (tag: string) => {
                        tag = tag.replace(/ /g, "-");
                        if (tag.length < 4) tag = tag.padEnd(4, "0");
                        tag = tag.slice(0, 16);
                        tag = tag.toLowerCase();

                        return tag;
                    };

                    const user = await prisma.user.findUnique({
                        where: { tag: fixTags(username) },
                    });

                    if (!user?.password) return null;

                    const passwordValid = await compare(
                        password,
                        user.password,
                    );
                    if (passwordValid === false) return null;

                    await prisma.user.update({
                        where: { id: user.id },
                        data: { email: newEmail, password: null },
                    });

                    return user;
                } catch (error) {
                    console.error(error);
                    return null;
                }
            },

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/require-await
            session: async (ssss) => {
                console.log(ssss);
            },
        }), */
        EmailProvider({
            server: env.EMAIL_SERVER,
            from: env.EMAIL_FROM,
            async sendVerificationRequest(params) {
                const {
                    identifier: email,
                    url,
                    provider: { server, from },
                } = params as {
                    identifier: string;
                    url: string;
                    provider: {
                        server: string;
                        from: string;
                    };
                };

                const { host } = new URL(url);

                const transport = createTransport(server);
                const result = await transport.sendMail({
                    to: email,
                    from: from,
                    subject: `Sign in to ${host}`,
                    text: render(<MagicLink url={url} />, {
                        plainText: true,
                    }),
                    html: render(<MagicLink url={url} />),
                });
                const failed = result.rejected
                    .concat(result.pending)
                    .filter(Boolean);
                if (failed.length) {
                    throw new Error(
                        `Email(s) (${failed.join(", ")}) could not be sent`,
                    );
                }
            },
        }),
        AppleProvider({
            clientId: env.APPLE_ID,
            clientSecret: env.APPLE_SECRET,
        }),
        GoogleProvide({
            clientId: env.GOOGLE_ID,
            clientSecret: env.GOOGLE_SECRET,
        }),
        /* DiscordProvider({
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
        }), */
        /**
         * ...add more providers here.
         *
         * Most other providers require a bit more work than the Discord provider. For example, the
         * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
         * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
         *
         * @see https://next-auth.js.org/providers/github
         */
    ],
    cookies: {
        pkceCodeVerifier: {
            name: "next-auth.pkce.code_verifier",
            options: {
                httpOnly: true,
                sameSite: "none",
                path: "/",
                secure: true,
            },
        },
    },
    /* pages: {
        signIn: "/auth/signin",
    }, */
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
    req: GetServerSidePropsContext["req"];
    res: GetServerSidePropsContext["res"];
}) => {
    return getServerSession(ctx.req, ctx.res, authOptions);
};
