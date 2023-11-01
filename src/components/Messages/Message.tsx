import { Message } from "prisma/generated/zod";

type Props = {
  message: Message;
  mine: boolean;
};

const Message = ({ message, mine }: Props) => {
  return (
    <div
      className={`${
        mine ? "self-end" : "self-start"
      } flex max-w-[75%] flex-col`}
    >
      <p
        className={`${
          mine
            ? " border border-primary bg-primary"
            : " bg-dark border-dark border"
        } my-1 break-all rounded-md px-4 py-2`}
      >
        {message.content}{" "}
      </p>
      {/* check if last message is read 
       <p className="self-end text-sm text-gray-400">
        {i === messageObj.messages.length - 1 &&
          message.me &&
          message.read.state &&
          "Read"}
      </p> */}
    </div>
  );
};
export default Message;
