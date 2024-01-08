import { Tooltip } from "@mantine/core";
import { IconCheck, IconEye, IconPlus } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  activity: RouterOutputs["media"]["friendActivity"];
};

const FriendActivity = ({ activity }: Props) => {
  return (
    <div className="mt-2">
      <h3 className="mb-2 text-center text-lg font-semibold">
        Friend Activity
      </h3>
      <div className="flex flex-wrap items-center justify-center space-x-4">
        {activity?.map(({ username, image, status }) => (
          <div
            key={username}
            className="relative flex flex-col items-center justify-center rounded-md p-1"
          >
            <Tooltip label={username} withArrow>
              <Link href={`/user/${username}`}>
                <Image
                  src={image ? image : "/default-avatar.png"}
                  alt="user avatar"
                  className="rounded-full"
                  width={50}
                  height={50}
                />
              </Link>
            </Tooltip>
            <div className="absolute right-0 top-0 rounded-full bg-slate-800 p-1">
              {status === "WATCHING" ? (
                <IconEye size={20}/>
              ) : status === "PLAN_TO_WATCH" ? (
                <IconPlus size={20} />
              ) : (
                <IconCheck size={20} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default FriendActivity;
