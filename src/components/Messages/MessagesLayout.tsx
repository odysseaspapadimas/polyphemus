"use client";

import type { RouterOutputs } from "src/trpc/shared";
import ChatUser from "./ChatUser";
import type { Session } from "next-auth";
import { useParams } from "next/navigation";
import { api } from "src/trpc/react";
import { useContext, useEffect, useRef } from "react";
import { PusherContext } from "src/providers/PusherProvider";

type Props = {
  initialChats: RouterOutputs["messages"]["getChats"];
  session: Session;
  children: React.ReactNode;
};

const MessagesLayout = ({ initialChats, session, children }: Props) => {
  const { username } = useParams() as
    | { username: string }
    | Record<string, never>; //username or empty object

  const isOnChat = !!username;

  const chats = api.messages.getChats.useQuery(undefined, {
    initialData: initialChats,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const utils = api.useContext();

  const initialized = useRef(false);
  const { pusher } = useContext(PusherContext);

  useEffect(() => {
    if (!pusher) return;
    if (!initialized.current) {
      initialized.current = true;

      const channel = pusher.subscribe("chat");

      channel.bind("message", async () => {
        await utils.messages.getChat.refetch({ username });
        await utils.messages.getChats.refetch();
        await utils.messages.unreadCount.refetch();
      });
    }

    // return () => {
    //   pusher.unsubscribe("chat");
    // };
  }, [
    utils.messages.getChat,
    utils.messages.getChats,
    utils.messages.unreadCount,
    username,
    pusher,
  ]);

  return (
    <>
      {!isOnChat ? (
        <div className={`w-full pt-5 md:max-w-xs`}>
          <h2 className="mb-2 text-2xl font-semibold">Messages</h2>

          <div className="flex flex-col items-start justify-start space-y-2">
            {chats.data?.map((chat) => (
              <ChatUser key={chat.id} chat={chat} session={session} />
            ))}
          </div>
        </div>
      ) : (
        <div className={`hidden w-full py-5 md:block md:max-w-xs`}>
          <h2 className="mb-2 text-2xl font-semibold">Messages</h2>

          <div className="flex flex-col items-start justify-start space-y-2">
            {chats.data?.map((chat) => (
              <ChatUser
                key={chat.id}
                chat={chat}
                session={session}
                selected={username}
              />
            ))}
          </div>
        </div>
      )}

      {children}
    </>
  );
};
export default MessagesLayout;
