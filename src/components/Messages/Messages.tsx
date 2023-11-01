import type { RouterOutputs } from "src/trpc/shared";
import Message from "./Message";
import type { Session } from "next-auth";

type Props = {
  chat: RouterOutputs["messages"]["getChat"];
  session: Session;
};

const Messages = ({ chat, session }: Props) => {
  return (
    <div className="h-screen-messages-mobile mx-auto flex flex-col py-2 pl-[13px] pr-1">
      {chat?.messages.map((message) => (
        <Message
          key={message.id}
          message={message}
          mine={session.user.username === message.senderUsername}
        />
      ))}
    </div>
  );
};
export default Messages;
