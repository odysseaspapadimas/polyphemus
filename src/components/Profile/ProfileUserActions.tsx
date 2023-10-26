"use client";

import { Button, Group } from "@mantine/core";
import type { Session } from "next-auth";
import { api } from "src/trpc/react";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  session: Session | null;
  user: NonNullable<RouterOutputs["user"]["get"]>;
  isFollowing: boolean;
  sessionUser: RouterOutputs["user"]["get"] | null | undefined;
};

const ProfileUserActions = ({
  session,
  user,
  isFollowing,
  sessionUser,
}: Props) => {
  const utils = api.useContext();
  const toggleFollow = api.user.toggleFollow.useMutation({
    onMutate: async ({ follow }) => {
      //update the user page with my user optimistically
      await utils.user.get.cancel();

      if (sessionUser) {
        const optimisticSessionUser = {
          _count: {
            followers: sessionUser.followers.length,
            following: sessionUser.following.length,
          },
          id: sessionUser.id,
          email: sessionUser.email,
          emailVerified: sessionUser.emailVerified,
          image: sessionUser.image,
          name: sessionUser.name,
          username: sessionUser.username,
        };
        // console.log(user.followers[0], sessionUser, "test");
        if (follow) {
          utils.user.get.setData({ username: user.username! }, () => {
            return {
              ...user,
              followers: [...user.followers, optimisticSessionUser],
            };
          });
        } else {
          utils.user.get.setData({ username: user.username! }, () => {
            return {
              ...user,
              followers: user.followers.filter(
                (follower) => follower.id !== sessionUser.id,
              ),
            };
          });
        }
      }
    },
    onSuccess: async () => {
      await utils.user.get.invalidate({ username: user.username! });
    },
  });

  if (!session || session.user.username === user.username) {
    return null;
  }

  return (
    <Group className="mb-4 md:mb-0">
      <Button
        color={!isFollowing ? "blue" : "gray"}
        onClick={() =>
          toggleFollow.mutate({
            username: user.username!,
            follow: !isFollowing,
          })
        }
      >
        {!isFollowing ? "Follow" : "Unfollow"}
      </Button>
    </Group>
  );
};
export default ProfileUserActions;
