"use client";

import { Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useContext, useRef, useState } from "react";
import { PusherContext } from "src/providers/PusherProvider";
import { api } from "src/trpc/react";
import SendMedia from "./SendMedia";
import type { Message } from "prisma/generated/zod";
import type { MovieResult, PersonResult, TvResult } from "moviedb-promise";

type Props = {
  username: string;
};

const ChatInput = ({ username }: Props) => {
  const [input, setInput] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const { socketId } = useContext(PusherContext);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setInput("");
    handleSend();
  };

  const handleSend = (media?: MovieResult | TvResult | PersonResult) => {
    if (media) {
      let name, image, mediaType;
      if (media.media_type === "movie") {
        name = media.title;
        image = media.poster_path;
        mediaType = "MOVIE" as const;
      } else if (media.media_type === "tv") {
        name = media.name;
        image = media.poster_path;
        mediaType = "SHOW" as const;
      } else {
        name = media.name;
        image = media.profile_path;
        mediaType = "PERSON" as const;
      }

      sendMessage.mutate({
        content: input,
        to: username,
        socketId,
        mediaId: media.id!,
        mediaName: name ?? "Unknown",
        mediaType,
        mediaImage: image ?? null,
      });
    } else {
      sendMessage.mutate({
        content: input,
        to: username,
        socketId,
        mediaId: null,
        mediaName: null,
        mediaType: null,
        mediaImage: null,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey === false) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const utils = api.useContext();

  const sendMessage = api.messages.send.useMutation({
    onMutate: async ({
      content,
      to,
      mediaId,
      mediaName,
      mediaType,
      mediaImage,
    }) => {
      await utils.messages.getChat.cancel();
      utils.messages.getChat.setData({ username }, (chatQuery) => {
        if (!chatQuery?.chat) return chatQuery;
        const newMessage: Message = {
          id: crypto.randomUUID(),
          content,
          createdAt: new Date(),
          chatId: chatQuery.chat.id,
          read: false,
          readAt: null,
          updatedAt: new Date(),
          mediaId,
          mediaName,
          mediaType,
          mediaImage,
          //chat has 2 users, my user is the one that i'm not sending to
          senderUsername: chatQuery.chat.users.find(
            (user) => user.username !== to,
          )!.username!,
        };
        return {
          ...chatQuery,
          chat: {
            ...chatQuery.chat,
            messages: [...chatQuery.chat.messages, newMessage],
          },
        };
      });
    },
    onSuccess: async () => {
      await utils.messages.getChat.invalidate({ username });
      await utils.messages.getChats.invalidate();
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mx-auto mb-4 mt-auto flex w-[95%] items-center space-x-2 self-center"
    >
      {/* <SendMedia user={myUser?.username} otherUser={user?.username} /> */}
      <SendMedia handleSend={handleSend} />
      <Textarea
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        size="md"
        autosize
        maxRows={3}
        className="flex-1"
        placeholder="Enter message"
        rightSection={
          <button disabled={!input}>
            <IconSend size={20} className="" />
          </button>
        }
      />
    </form>
  );
};
export default ChatInput;
