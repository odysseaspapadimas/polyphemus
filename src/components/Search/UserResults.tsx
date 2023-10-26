import { Group } from "@mantine/core";
import Image from "next/image";
import Link from "next/link";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  userResults: RouterOutputs["user"]["search"];
};

const UserResults = ({ userResults }: Props) => {
  return (
    <div>
      {userResults.map((user) => (
        <Group key={user.username}>
          <Link href={`/user/${user.username}`}>
            <Image
              src={user.image!}
              alt="user profile"
              width={50}
              height={50}
              className="rounded-full border border-transparent transition-all duration-200 hover:border-primary"
            />
          </Link>
          <div>
            <Link href={`/user/${user.username}`}>
              <h3 className="text-lg font-semibold hover:text-primary">
                {user.username}
              </h3>
            </Link>

            <p className="text-sm text-gray-400">
              <Link
                href={`/user/${user.username}`}
                className="hover:text-primary"
              >
                {user._count.followers} followers
              </Link>
              {", "}
              <Link
                href={`/user/${user.username}`}
                className="hover:text-primary"
              >
                {user._count.following} following
              </Link>
            </p>
          </div>
        </Group>
      ))}
    </div>
  );
};
export default UserResults;
