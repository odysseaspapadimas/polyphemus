import Image from "next/image";
import Link from "next/link";
import type { Message } from "prisma/generated/zod";
import { IMG_URL } from "src/lib/tmdb";
import SpoilerMessage from "./SpoilerMessage";

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
      {message.mediaId ? (
        <Link
          href={`/${message.mediaType?.toLowerCase()}/${message.mediaId}`}
          className={`${
            mine
              ? " border border-primary bg-primary"
              : " border border-dark bg-dark"
          }  my-1 flex flex-col items-center space-y-1 rounded-md p-3 text-center`}
        >
          {message.mediaImage ? (
            <Image
              width={100}
              height={150}
              src={IMG_URL(message.mediaImage)}
              alt="media image"
            />
          ) : (
            <div className="h-[150px] w-[100px] border bg-slate-700"></div>
          )}
          <p>{message.mediaName}</p>
        </Link>
      ) : message.spoilerMedia && !message.spoilerRevealed && !mine ? (
        <SpoilerMessage mine={mine} message={message} last={last} />
      ) : (
        <p
          className={`${
            mine
              ? " rounded-br-none border border-primary bg-primary"
              : " rounded-bl-none border border-dark bg-dark"
          } my-1 break-all rounded-md px-4 py-2`}
        >
          {message.content}
        </p>
      )}
      <p className="self-end text-sm text-gray-400">
        {last && mine && message.read && "Read"}
      </p>
    </div>
  );
};
export default MessageComponent;
