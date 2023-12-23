"use client";

import type { RouterOutputs } from "src/trpc/shared";
import ChatUser from "./ChatUser";
import type { Session } from "next-auth";
import { useParams } from "next/navigation";
import { api } from "src/trpc/react";
import { useState } from "react";
import NewMessage from "./NewMessage";
import { Group } from "@mantine/core";

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

  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {!isOnChat ? (
        <div className={`w-full pt-5 md:max-w-xs`}>
          <Group justify="space-between">
            <h2 className="mb-2 text-2xl font-semibold">Messages</h2>
            <NewMessage showModal={showModal} setShowModal={setShowModal} />
          </Group>

          <div className="flex flex-col items-start justify-start space-y-2">
            {chats.data
              ?.sort((a, b) => {
                const dateA = new Date(a.updatedAt);
                const dateB = new Date(b.updatedAt);

                if (dateA < dateB) return 1;
                if (dateA > dateB) return -1;
                return 0;
              })
              .map((chat) => (
                <ChatUser key={chat.id} chat={chat} session={session} />
              ))}
          </div>
        </div>
      ) : (
        <div className={`hidden w-full py-5 md:block md:max-w-xs`}>
          <Group justify="space-between">
            <h2 className="mb-2 text-2xl font-semibold">Messages</h2>
            <NewMessage showModal={showModal} setShowModal={setShowModal} />
          </Group>
          <div className="flex flex-col items-start justify-start space-y-2">
            {chats.data
              ?.sort((a, b) => {
                const dateA = new Date(a.updatedAt);
                const dateB = new Date(b.updatedAt);

                if (dateA < dateB) return 1;
                if (dateA > dateB) return -1;
                return 0;
              })
              .map((chat) => (
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
