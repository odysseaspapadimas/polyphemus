"use client";

import { Button, Group } from "@mantine/core";
import type { Session } from "next-auth";
import { api } from "src/trpc/react";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  session: Session | null;
  user: NonNullable<RouterOutputs["user"]["get"]>;
  isFollowing: boolean;
};

const ProfileUserActions = ({ session, user, isFollowing }: Props) => {
  const utils = api.useContext();
  const toggleFollow = api.user.toggleFollow.useMutation({
    onSettled: async () => {
      await utils.user.get.invalidate();
    },
  });

  if (!session) {
    return null;
  }

  return (
    <Group>
      <Button
        color={!isFollowing ? "blue" : "gray"}
        loading={toggleFollow.isLoading}
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
