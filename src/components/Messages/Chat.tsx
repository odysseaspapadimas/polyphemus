"use client";

import type { Session } from "next-auth";
import ChatInput from "./ChatInput";
import MessagesBox from "./MessagesBox";

type Props = {
  username: string;
  session: Session;
};

const Chat = ({ username, session }: Props) => {
  return (
    <div className="relative w-full">
      <MessagesBox username={username} session={session} />
      <ChatInput username={username} />
    </div>
  );
};
export default Chat;
