import dayjs from "dayjs";
import type { Session } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import type { RouterOutputs } from "src/trpc/shared";

export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

type Props = {
  chat: ArrayElement<RouterOutputs["messages"]["getChats"]>;
  session: Session;
  selected?: string;
};

const ChatUser = ({ chat, session, selected }: Props) => {
  const user = chat.users.find(
    (user) => user.username !== session.user.username,
  );

  if (!user) {
    return null;
  }

  const lastMessage = chat.messages.at(-1);
  const myMessage = lastMessage?.senderUsername === session.user.username;

  return (
    <Link
      href={`/messages/${user.username}`}
      className={`flex w-full items-center space-x-2 rounded-sm border border-dark-bg-hover px-4 py-2 hover:bg-dark-bg-hover ${
        selected === user.username && "bg-dark-bg-hover"
      }`}
      prefetch={false}
    >
      <Image
        src={user.image!}
        alt="user"
        width={30}
        height={30}
        className="rounded-full"
      />
      <div
        className={`ml-3 flex max-w-[250px] flex-col ${
          !myMessage && !lastMessage?.read ? "text-white" : "text-gray-400"
        }`}
      >
        <p className="font-semibold hover:text-gray-200">{user.username}</p>
        <div className="flex items-center space-x-2 ">
          <p
            className={`block overflow-hidden text-ellipsis whitespace-nowrap text-sm`}
          >
            {myMessage && "You: "}{" "}
            {lastMessage?.content ? lastMessage.content : ""}
          </p>
          <p className="text-sm">
            {dayjs(lastMessage?.createdAt).format("HH:mm")}
          </p>
        </div>
      </div>
    </Link>
  );
};
export default ChatUser;
