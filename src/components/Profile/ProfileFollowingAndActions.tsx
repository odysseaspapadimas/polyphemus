"use client";

import type { RouterOutputs } from "src/trpc/shared";
import FollowersFollowing from "./FollowersFollowing";
import ProfileUserActions from "./ProfileUserActions";
import type { Session } from "next-auth";
import { api } from "src/trpc/react";
import { useParams } from "next/navigation";

type Props = {
  user: NonNullable<RouterOutputs["user"]["get"]>;
  session: Session | null;
};
const ProfileFollowingAndActions = ({ user, session }: Props) => {
  const params = useParams();

  const username = params.username as string;

  const sessionUser = api.user.get.useQuery(
    { username: session?.user.username },
    { enabled: !!session?.user.username },
  );

  const userQuery = api.user.get.useQuery({ username }, { initialData: user });

  const followers = userQuery.data!.followers;
  const following = userQuery.data!.following;

  const isFollowing = followers.some(
    (user) => user.username === session?.user.username,
  );

  return (
    <>
      <FollowersFollowing
        followers={followers}
        following={following}
        sessionUser={sessionUser.data}
      />

      <ProfileUserActions
        session={session}
        user={userQuery.data!}
        isFollowing={isFollowing}
      />
    </>
  );
};
export default ProfileFollowingAndActions;
