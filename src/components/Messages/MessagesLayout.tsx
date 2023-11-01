"use client";

import type { RouterOutputs } from "src/trpc/shared";
import ChatUser from "./ChatUser";
import type { Session } from "next-auth";
import { useParams } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";

type Props = {
  chats: RouterOutputs["messages"]["getChats"];
  session: Session;
  children: React.ReactNode;
};

const MessagesLayout = ({ chats, session, children }: Props) => {
  const params = useParams() as { username: string } | Record<string, never>; //username or empty object

  const isOnChat = !!params.username;
  return (
    <>
      {!isOnChat ? (
        <div className={`w-full md:max-w-xs`}>
          <h2 className="text-2xl font-semibold">Messages</h2>

          <div className="flex flex-col items-start justify-start space-y-2">
            {chats?.map((chat) => (
              <ChatUser key={chat.id} chat={chat} session={session} />
            ))}
          </div>
        </div>
      ) : (
        <div className={`hidden w-full md:block md:max-w-xs`}>
          <h2 className="text-2xl font-semibold">Messages</h2>

          <div className="flex flex-col items-start justify-start space-y-2">
            {chats?.map((chat) => (
              <ChatUser key={chat.id} chat={chat} session={session} />
            ))}
          </div>
        </div>
      )}

      {children}
    </>
  );
};
export default MessagesLayout;
