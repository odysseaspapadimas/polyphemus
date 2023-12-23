"use client";

import { api } from "src/trpc/react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import Image from "next/image";
import Messages from "./Messages";
import type { Session } from "next-auth";
import { Center, Loader, Skeleton } from "@mantine/core";
import React, { useContext, useEffect } from "react";
import { PusherContext } from "src/providers/PusherProvider";
const MessagesBox = ({
  username,
  session,
}: {
  username: string;
  session: Session;
}) => {
  const chatQuery = api.messages.getChat.useQuery(
    { username },
    {
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const user = chatQuery.data?.chat
    ? chatQuery.data.chat.users.find((user) => user.username === username)
    : chatQuery.data?.user;

  const utils = api.useContext();
  const readMessage = api.messages.read.useMutation({
    onSuccess: async () => {
      await utils.messages.getChats.refetch();
      await utils.messages.getChat.refetch({ username });
      await utils.messages.unreadCount.refetch();
    },
  });

  const { socketId } = useContext(PusherContext);

  useEffect(() => {
    if (!chatQuery.data || !chatQuery.data.chat) return;
    const lastMessage =
      chatQuery.data.chat?.messages[chatQuery.data.chat.messages.length - 1];

    if (
      lastMessage &&
      lastMessage.senderUsername !== session.user.username &&
      !lastMessage.read
    ) {
      console.log("read msg");

      readMessage.mutate({
        chatId: chatQuery.data.chat.id,
        socketId,
        username,
      });
    }

    //readMessage dependency causes infinite loop which makes sense
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatQuery.data, session.user]);

  return (
    <>
      <div className="flex items-center px-4 py-4 md:hidden">
        <Link className="flex-1" href={"/messages"}>
          <IconArrowLeft size={28} />
        </Link>
        <div className="flex flex-[2] items-center justify-center space-x-2">
          <UserImage image={user?.image} />
          <Link href={`/user/${username}`}>
            <p className="text-lg font-semibold">{username} </p>
          </Link>
        </div>
        <div className="flex-1"></div>
        <span className="absolute -left-4 top-16 w-screen border-b border-solid border-[rgb(44,46,51)]"></span>
      </div>

      <div className="px-auto hidden w-full items-center justify-center space-x-2 pt-5 md:flex">
        <UserImage image={user?.image} />
        <Link href={`/user/${username}`}>
          <h2 className="text-xl">{username}</h2>
        </Link>
      </div>

      {chatQuery.isLoading ? (
        <Center className="h-screen-messages-mobile w-full">
          <Loader />
        </Center>
      ) : (
        chatQuery.data !== null &&
        chatQuery.data !== undefined && (
          <Messages chat={chatQuery.data.chat} session={session} />
        )
      )}
    </>
  );
};
export default MessagesBox;

const UserImage = ({ image }: { image: string | null | undefined }) =>
  image ? (
    <Image
      src={image}
      alt="user avatar"
      className="rounded-full"
      width={36}
      height={36}
    />
  ) : (
    <Skeleton width={36} height={36} className="rounded-full" />
  );
