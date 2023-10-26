"use client";

import { ActionIcon, Center, Group, Modal, Tabs } from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import type { Session } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import type { User as UserType } from "prisma/generated/zod";
import { useState } from "react";
import { api } from "src/trpc/react";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  followers: (UserType & {
    _count: { followers: number; following: number };
  })[];
  following: (UserType & {
    _count: { followers: number; following: number };
  })[];
  sessionUser: RouterOutputs["user"]["get"] | null | undefined;
};

type TabProps = {
  tab: "FOLLOWERS" | "FOLLOWING";
  opened: boolean;
};

const FollowersFollowing = ({ followers, following, sessionUser }: Props) => {
  const [tabState, setTabState] = useState<TabProps>({
    opened: false,
    tab: "FOLLOWERS",
  });

  return (
    <>
      <Group className="mx-8 space-x-4">
        <div
          onClick={() => setTabState({ opened: true, tab: "FOLLOWERS" })}
          className="flex w-[85px] flex-col items-center justify-center p-2 hover:cursor-pointer hover:bg-[#27292e]"
        >
          <p>{followers ? followers.length : 0}</p>
          <p>Followers</p>
        </div>

        <div
          onClick={() => setTabState({ opened: true, tab: "FOLLOWING" })}
          className="flex w-[85px] flex-col items-center justify-center p-2 hover:cursor-pointer hover:bg-[#27292e]"
        >
          <p>{following ? following.length : 0}</p>
          <p>Following</p>
        </div>
      </Group>

      <Modal
        opened={tabState.opened}
        onClose={() =>
          setTabState((state) => ({ opened: false, tab: state.tab }))
        }
      >
        <Tabs
          value={tabState.tab}
          // @ts-expect-error this way tabs are typed
          onChange={(tab: TabProps["tab"]) => setTabState({ ...tabState, tab })}
          classNames={{
            tabLabel: "mb-1 sm:text-lg leading-[18px]",
          }}
        >
          <Tabs.List grow>
            <Tabs.Tab value="FOLLOWERS">Followers</Tabs.Tab>
            <Tabs.Tab value="FOLLOWING">Following</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="FOLLOWERS">
            <div className="flex flex-col space-y-3 py-4">
              {followers.length > 0 ? (
                followers.map((user) => (
                  <User key={user.id} user={user} sessionUser={sessionUser} />
                ))
              ) : (
                <Center my={13}>
                  <p>No followers</p>
                </Center>
              )}
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="FOLLOWING">
            <div className="flex flex-col space-y-3 py-4">
              {following.length > 0 ? (
                following.map((user) => (
                  <User key={user.id} user={user} sessionUser={sessionUser} />
                ))
              ) : (
                <Center my={13}>
                  <p>No following</p>
                </Center>
              )}
            </div>
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
};
export default FollowersFollowing;

const User = ({
  user,
  sessionUser,
}: {
  user: UserType & { _count: { followers: number; following: number } };
  sessionUser: RouterOutputs["user"]["get"] | null | undefined;
}) => {
  const router = useRouter();
  const utils = api.useContext();
  const toggleFollow = api.user.toggleFollow.useMutation({
    onSettled: async () => {
      console.log(user.username, sessionUser?.username, "usernames");
      await utils.user.get.invalidate({ username: sessionUser!.username! });
    },
  });
  return (
    <Group>
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
          <Link href={`/user/${user.username}`} className="hover:text-primary">
            {user._count.followers ?? 0} followers
          </Link>
          {", "}
          <Link href={`/user/${user.username}`} className="hover:text-primary">
            {user._count.following ?? 0} following
          </Link>
        </p>
      </div>

      {sessionUser &&
        (sessionUser.following?.some(
          (following) => following.id === user.id,
        ) ? (
          <ActionIcon
            loading={toggleFollow.isLoading}
            className="ml-auto mr-4"
            onClick={() =>
              toggleFollow.mutate({
                username: user.username!,
                follow: false,
                followingArray: sessionUser.following,
              })
            }
          >
            <IconX />
          </ActionIcon>
        ) : (
          <ActionIcon
            loading={toggleFollow.isLoading}
            className="ml-auto mr-4"
            onClick={() =>
              toggleFollow.mutate({
                username: user.username!,
                follow: true,
                followingArray: sessionUser.following,
              })
            }
          >
            <IconPlus />
          </ActionIcon>
        ))}
    </Group>
  );
};
