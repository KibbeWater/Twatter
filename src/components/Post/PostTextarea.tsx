import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

type TweetAreaProps = {
    placeholder?: string;
    value?: string;
    inline?: boolean;
    onChange?: (text: string) => void;
};

export default function PostTextarea({
    placeholder,
    inline,
    value,
    onChange,
}: TweetAreaProps) {
    const [text, setText] = useState(value ?? "");
    const [tag, setTag] = useState("");

    /* useEffect(() => {
        const controller = new AbortController();
        if (tag.length === 0) return setUsers([]);
        else
            import("axios").then((pkg) => {
                pkg.default
                    .get<{
                        success: boolean;
                        error?: string;
                        data: SafeUser[];
                    }>(`/api/search?q=${tag}`, { signal: controller.signal })
                    .then((res) => {
                        if (!res.data.success)
                            return console.error(res.data.error);
                        setUsers(res.data.data);
                        console.log(res.data.data);
                    })
                    .catch((err) => {});
            });
        return () => controller.abort();
    }, [tag]); */

    const parent = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value === undefined) return;
        setText(value);
    }, [value]);

    useEffect(() => {
        if (!onChange) return;
        onChange(text);
    }, [text, onChange]);

    const handleInputChange = (content: string) => {
        setText(content);

        const value = content;
        const regex = /@\w+/g; // regex to match @username
        const match = value.match(regex);

        const lastMatch = match && match.length > 0 && match[match.length - 1];
        if (lastMatch && value.endsWith(lastMatch))
            return setTag(lastMatch.substring(1)); // remove @ symbol from username

        setTag("");
    };

    return (
        <div className="relative" ref={parent}>
            <TextareaAutosize
                placeholder={placeholder ?? "What's happening?"}
                className={
                    !inline
                        ? "w-full outline-none border-0 resize-none text-xl bg-transparent text-black dark:text-white"
                        : "text-black dark:text-white bg-transparent border-0 text-lg leading-6 columns-4 resize-none w-full p-0 m-0 outline-none"
                }
                value={text}
                maxLength={2000}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleInputChange(e.target.value)
                }
            />
            {/* <CustomTextarea
                placeholder={placeholder ?? "What's happening?"}
                className={
                    !inline
                        ? "w-full outline-none border-0 resize-none text-xl bg-transparent text-black dark:text-white"
                        : "text-black dark:text-white bg-transparent border-0 text-lg leading-6 columns-4 resize-none w-full p-0 m-0 outline-none"
                }
                value={text}
                maxLength={2000}
                onChange={handleInputChange}
            /> */}
            {tag && (
                <div className="min-w-[18rem] max-h-96 min-h-[2rem] shadow-lg rounded-md bg-neutral-50 dark:bg-neutral-950 absolute z-10 overflow-auto overflow-x-hidden">
                    {/* users.map((usr, idx) => (
                        <UserEntry
                            user={usr}
                            key={`mention-search-result-${usr._id}`}
                            onClick={(e) => {
                                setText(
                                    text.replace(`@${tag}`, `@${usr.tag} `),
                                );
                                setTag("");
                            }}
                        />
                    )) */}
                </div>
            )}
        </div>
    );
}