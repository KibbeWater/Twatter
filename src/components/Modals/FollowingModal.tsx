import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/solid";

import { api } from "~/utils/api";
import { useModal } from "../Handlers/ModalHandler";
import UserContext from "../UserContext";

export default function FollowingModal({
    user,
    followType,
}: {
    user?: { id: string };
    followType: "followers" | "following";
}) {
    const { closeModal } = useModal();

    const { data, isLoading } = api.user.getFollowing.useQuery(
        { id: user!.id, followType },
        { enabled: !!user },
    );

    return (
        <div
            className={
                "bg-white dark:bg-black lg:w-[35%] md:w-1/3 w-5/6 rounded-xl overflow-hidden flex flex-col"
            }
        >
            <div
                className={
                    "h-10 p-1 flex justify-between border-b-[1px] border-gray-200 dark:border-gray-700"
                }
            >
                <div className="h-full flex items-center justify-center ml-2">
                    <h1 className="font-semibold leading-none">
                        {followType === "followers" ? "Followers" : "Following"}
                    </h1>
                </div>

                <div
                    className={
                        "w-8 h-8 rounded-full flex items-center justify-center bg-black/0 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                    }
                    onClick={() => closeModal()}
                >
                    <XMarkIcon className={"text-black dark:text-white"} />
                </div>
            </div>
            <div className={"flex flex-col overflow-y-auto max-h-[33.333vh]"}>
                {data?.map((u) => (
                    <UserContext key={`${followType}-${u.id}`} user={u} />
                ))}
                {data?.length === 0 && (
                    <div className="flex justify-center items-center text-center h-12">
                        <h1 className="text-gray-400 dark:text-gray-600">
                            No {followType}
                        </h1>
                    </div>
                )}
                {isLoading && (
                    <div
                        className={
                            "w-full mt-4 flex justify-center items-center"
                        }
                    >
                        <ArrowPathIcon
                            className={
                                "animate-spin h-[1.5em] text-black dark:text-white"
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
