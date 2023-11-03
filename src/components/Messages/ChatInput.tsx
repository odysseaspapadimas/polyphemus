"use client";

import { Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useContext, useRef, useState } from "react";
import { PusherContext } from "src/providers/PusherProvider";
import { api } from "src/trpc/react";

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
    sendMessage.mutate({ content: input, to: username, socketId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey === false) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const utils = api.useContext();

  const sendMessage = api.messages.send.useMutation({
    onMutate: async ({ content, to }) => {
      await utils.messages.getChat.cancel();
      utils.messages.getChat.setData({ username }, (chat) => {
        if (!chat) return chat;
        const newMessage = {
          id: crypto.randomUUID(),
          content,
          createdAt: new Date(),
          chatId: chat.id,
          read: false,
          readAt: null,
          updatedAt: new Date(),
          //chat has 2 users, my user is the one that i'm not sending to
          senderUsername: chat.users.find((user) => user.username !== to)!
            .username!,
        };
        return {
          ...chat,
          messages: [...chat.messages, { ...newMessage }],
        };
      });
    },
    onSuccess: async () => {
      //i don't need to invalidate because i'm refetching on message send with pusher
      //i need to move pusher higher up in the component tree and use socket_id to exclude myself
      // await utils.messages.getChat.invalidate({ username });
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mx-auto mb-4 mt-auto flex w-[95%] items-center space-x-2 self-center"
    >
      {/* <SendMedia user={myUser?.username} otherUser={user?.username} /> */}
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
