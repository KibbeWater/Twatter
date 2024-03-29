import { LockClosedIcon } from "@heroicons/react/24/solid";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { useModal } from "~/components/Handlers/ModalHandler";
import AdminModal from "~/components/Modals/AdminModal";
import FollowingModal from "~/components/Modals/FollowingModal";
import ProfileEditor from "~/components/Modals/ProfileEditor";
import PostComponent, { type PostComponentShape } from "~/components/Post/Post";
import PostContent from "~/components/Post/PostContent";
import Layout from "~/components/Site/Layouts/Layout";
import ProfileSkeleton from "~/components/Skeletons/ProfileSkeleton";
import VerifiedCheck from "~/components/Verified";

import { api } from "~/utils/api";
import { PERMISSIONS, hasPermission } from "~/utils/permission";
import { isPremium } from "~/utils/user";

function isUserFollowing(
    user: { id: string } | undefined,
    profile: { followers: { id: string }[] } | undefined,
) {
    if (!user || !profile) return false;
    return profile.followers.find((u) => u.id === user.id) !== undefined;
}

export default function Home() {
    const tag = useRouter().query.tag as string;

    const { data: session } = useSession();
    const user = session?.user;

    const { data: profile, refetch } = api.user.getProfile.useQuery(
        { tag },
        { enabled: !!tag },
    );
    const { mutate: _setFollowing } = api.followers.setFollowing.useMutation();
    const { setModal } = useModal();

    const [followingText, setFollowingText] = useState<
        "Unfollow" | "Following"
    >("Following");
    const [isFollowing, setIsFollowing] = useState(
        isUserFollowing(user, profile),
    );

    const setFollowing = useCallback(
        (shouldFollow: boolean) => {
            if (!profile) return;

            const oldFollow = isFollowing;
            setIsFollowing(shouldFollow);

            _setFollowing(
                { id: profile.id, shouldFollow },
                {
                    onSuccess: () => setIsFollowing(shouldFollow),
                    onError: () => setIsFollowing(oldFollow),
                },
            );
        },
        [profile, _setFollowing, isFollowing],
    );

    useEffect(() => {
        setIsFollowing(isUserFollowing(user, profile));
    }, [user, profile]);

    const isMe = user?.id === profile?.id && user?.id !== undefined;
    const bio = profile?.bio ?? "";
    const isVerified =
        profile &&
        ((profile.verified ?? false) || isPremium(profile)) &&
        !hasPermission(profile, PERMISSIONS.HIDE_VERIFICATION);

    if (!profile) return <ProfileSkeleton />;

    return (
        <Layout title={profile?.name ?? "Loading..."}>
            <div>
                <div className="border-b-[1px] border-highlight-light dark:border-highlight-dark">
                    <div className="w-full pb-[33.3%] bg-neutral-700 relative flex justify-center">
                        {profile?.banner && (
                            <Image
                                src={profile.banner}
                                className={
                                    "absolute h-full w-full p-[auto] top-0 bottom-0 right-0 left-0 object-cover"
                                }
                                fill
                                sizes={"100vw"}
                                priority
                                alt={`${profile.name}'s Banner`}
                            />
                        )}
                    </div>
                    <div className="w-full flex justify-between relative">
                        <div className="relative h-16 mb-3">
                            <div className="w-32 h-32 absolute left-5 -top-16">
                                <div>
                                    <Image
                                        className="object-cover rounded-full border-[4px] border-white dark:border-black bg-white"
                                        src={
                                            profile.image ??
                                            "/assets/imgs/default-avatar.png"
                                        }
                                        alt={`${profile.name}'s Avatar`}
                                        fill
                                        sizes={"100vw"}
                                        quality={100}
                                        priority
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center absolute right-0 top-0">
                            <div className="mx-3 my-3">
                                {isMe ? (
                                    <button
                                        className="bg-black/0 px-[15px] py-2 font-semibold border-[1px] border-gray-400 text-black dark:text-white min-w-[36px] transition-all cursor-pointer rounded-full hover:bg-gray-700/10"
                                        onClick={() =>
                                            setModal(
                                                <ProfileEditor
                                                    name={user.name ?? ""}
                                                    bio={bio}
                                                    avatar={profile.image!}
                                                    banner={profile.banner}
                                                    onSave={() => {
                                                        refetch().catch(
                                                            console.error,
                                                        );
                                                    }}
                                                />,
                                            )
                                        }
                                    >
                                        Edit profile
                                    </button>
                                ) : isFollowing ? (
                                    <button
                                        className={
                                            "bg-black/0 px-[15px] py-2 font-semibold border-[1px] text-black dark:text-white border-gray-700 min-w-[36px] transition-all rounded-full " +
                                            "hover:bg-red-500/10 hover:text-red-600 hover:border-red-300 hover:cursor-pointer"
                                        }
                                        onClick={() => {
                                            setFollowing(false);
                                        }}
                                        onMouseEnter={() =>
                                            setFollowingText("Unfollow")
                                        }
                                        onMouseLeave={() =>
                                            setFollowingText("Following")
                                        }
                                    >
                                        {followingText}
                                    </button>
                                ) : (
                                    <button
                                        className={
                                            "bg-black dark:bg-white text-white dark:text-black px-[15px] py-2 font-bold cursor-pointer rounded-full"
                                        }
                                        onClick={() => {
                                            setFollowing(true);
                                        }}
                                    >
                                        Follow
                                    </button>
                                )}
                            </div>
                            {user &&
                            hasPermission(
                                user,
                                [
                                    PERMISSIONS.MANAGE_USERS,
                                    PERMISSIONS.MANAGE_USERS_EXTENDED,
                                    PERMISSIONS.MANAGE_USER_ROLES,
                                ],
                                true,
                            ) ? (
                                <button
                                    className={
                                        "bg-black dark:bg-white text-white dark:text-black px-[15px] py-2 font-bold cursor-pointer rounded-full mx-3"
                                    }
                                    onClick={() => {
                                        if (setModal)
                                            setModal(
                                                <AdminModal
                                                    userId={profile.id}
                                                    onMutate={() => {
                                                        refetch().catch(
                                                            console.error,
                                                        );
                                                    }}
                                                />,
                                            );
                                    }}
                                >
                                    Admin
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="mx-3 pb-3">
                        <h3 className="font-bold leading-none text-lg text-black dark:text-white flex items-center">
                            {profile?.name}
                            {isVerified ? (
                                <VerifiedCheck className="ml-1 w-5 h-5" />
                            ) : null}
                        </h3>
                        <p className="mt-[2px] text-base leading-none text-neutral-500">{`@${profile?.tag}`}</p>
                        {bio !== "" && bio !== undefined && (
                            <div className="my-1 mt-3 text-black dark:text-white leading-snug text-sm">
                                <PostContent post={{ content: bio }} />
                            </div>
                        )}
                        {!hasPermission(
                            profile,
                            PERMISSIONS.HIDE_FOLLOWINGS,
                        ) && (
                            <div className="flex my-2 text-sm">
                                <p
                                    className="m-0 mr-2 text-neutral-500 hover:underline cursor-pointer"
                                    onClick={() =>
                                        setModal(
                                            <FollowingModal
                                                user={profile}
                                                followType={"following"}
                                            />,
                                        )
                                    }
                                >
                                    <span className="font-bold text-black dark:text-white">
                                        {profile?.followingIds.length ?? 0}
                                    </span>{" "}
                                    Following
                                </p>
                                <p
                                    className="m-0 mr-2 text-neutral-500 hover:underline cursor-pointer"
                                    onClick={() =>
                                        setModal(
                                            <FollowingModal
                                                user={profile}
                                                followType={"followers"}
                                            />,
                                        )
                                    }
                                >
                                    <span className="font-bold text-black dark:text-white">
                                        {profile?.followerIds.length ?? 0}
                                    </span>{" "}
                                    Followers
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    {profile?.posts.length !== undefined &&
                    !hasPermission(profile, PERMISSIONS.HIDE_POSTS)
                        ? profile.posts.map((post) => {
                              if (!post) return null;
                              return (
                                  <div
                                      key={post.id}
                                      className="border-b-[1px] border-highlight-light dark:border-highlight-dark w-full"
                                  >
                                      <PostComponent
                                          post={post as PostComponentShape}
                                      />
                                  </div>
                              );
                          })
                        : null}
                    {hasPermission(profile, PERMISSIONS.HIDE_POSTS) && (
                        <div className="py-2 flex items-center justify-center w-full gap-1">
                            <LockClosedIcon className="h-5 text-neutral-500" />
                            <p className="text-neutral-500">Posts Hidden</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
