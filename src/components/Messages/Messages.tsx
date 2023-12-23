import type { RouterOutputs } from "src/trpc/shared";
import Message from "./Message";
import type { Session } from "next-auth";
import { ScrollArea } from "@mantine/core";
import { useEffect, useRef } from "react";

type Props = {
  chat: RouterOutputs["messages"]["getChat"]["chat"];
  session: Session;
};

const Messages = ({ chat, session }: Props) => {
  const viewport = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    viewport.current!.scrollTo({
      top: viewport.current!.scrollHeight,
      behavior: "instant",
    });

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages]);

  return (
    <ScrollArea className="h-screen-messages-mobile" viewportRef={viewport}>
      <div className="flex flex-col overflow-y-auto px-4 py-2">
        {chat?.messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            mine={session.user.username === message.senderUsername}
            last={chat.messages[chat.messages.length - 1]?.id === message.id}
          />
        ))}
      </div>
    </ScrollArea>
  );
};
export default Messages;
