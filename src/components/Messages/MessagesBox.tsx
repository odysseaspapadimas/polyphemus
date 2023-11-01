"use client";

import { api } from "src/trpc/react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import Messages from "./Messages";
import { Session } from "next-auth";

const MessagesBox = ({ username, session }: { username: string; session: Session }) => {
  const [chat, chatQuery] = api.messages.getChat.useSuspenseQuery({ username });

  console.log(chat, chatQuery, "chat, chatquery");

  const user = chat?.users.find((user) => user.username === username);

  if (!user) {
    redirect("/messages");
  }

  return (
    <>
      <div className="flex items-center px-4 py-4 md:hidden">
        <Link className="flex-1" href={"/messages"}>
          <IconArrowLeft size={28} />
        </Link>
        <div className="flex flex-[2] items-center justify-center space-x-2">
          <Image
            src={user.image!}
            alt="user avatar"
            className="rounded-full"
            width={32}
            height={32}
          />
          <Link href={`/user/${username}`}>
            <p className="text-lg font-semibold">{username} </p>
          </Link>
        </div>
        <div className="flex-1"></div>
        <span className="absolute -left-4 top-16 w-screen border-b border-solid border-[rgb(44,46,51)]"></span>
      </div>

      <div className="px-auto hidden w-full items-center justify-center space-x-2 pt-5 md:flex">
        <Image
          src={user.image!}
          alt="user avatar"
          className="rounded-full"
          width={36}
          height={36}
        />
        <Link href={`/user/${username}`}>
          <h2 className="text-xl">{username}</h2>
        </Link>
      </div>

      {chatQuery.isLoading ? (
        <p>Loading...</p>
      ) : (
        chat !== null && <Messages chat={chat} session={session} />
      )}
    </>
  );
};
export default MessagesBox;
