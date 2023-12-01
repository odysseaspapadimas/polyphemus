import type { Message } from "prisma/generated/zod";

type Props = {
  message: Message;
  mine: boolean;
  last: boolean;
};

const MessageComponent = ({ message, mine, last }: Props) => {
  return (
    <div
      className={`${
        mine ? "self-end" : "self-start"
      } flex max-w-[75%] flex-col`}
    >
      <p
        className={`${
          mine
            ? " rounded-br-none border border-primary bg-primary"
            : " rounded-bl-none border border-dark bg-dark"
        } my-1 break-all rounded-md px-4 py-2`}
      >
        {message.content}
      </p>
      <p className="self-end text-sm text-gray-400">
        {last && mine && message.read && "Read"}
      </p>
    </div>
  );
};
export default MessageComponent;
