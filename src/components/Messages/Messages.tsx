import type { RouterOutputs } from "src/trpc/shared";
import Message from "./Message";
import type { Session } from "next-auth";
import { ScrollArea } from "@mantine/core";
import { useEffect, useRef } from "react";
import dayjs from "dayjs";

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

  //create a new object with messages grouped by date
  const groupedMessages = chat?.messages.reduce(
    (acc, message) => {
      const date = new Date(message.createdAt).toLocaleDateString();
      return {
        ...acc,
        [date]: [...(acc[date] ?? []), message],
      };
    },
    {} as Record<string, typeof chat.messages>,
  );

  return (
    <ScrollArea className="h-screen-messages-mobile" viewportRef={viewport}>
      <div className="flex flex-col overflow-y-auto px-4 py-2">
        {Object.entries(groupedMessages ?? {}).map(
          ([date, messages], i, arr) => (
            <div key={date} className="flex flex-col space-y-2">
              <h2 className="text-center text-sm text-gray-400 mt-2">
                {dayjs(date).format("DD MMM YYYY")}
              </h2>
              <div className="flex flex-col">
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    mine={session.user.username === message.senderUsername}
                    last={
                      i === arr.length - 1 &&
                      message.id === messages[messages.length - 1]?.id
                    }
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </ScrollArea>
  );
};
export default Messages;
