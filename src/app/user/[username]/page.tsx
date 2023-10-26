import { Container, Group } from "@mantine/core";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { StatusType } from "prisma/generated/zod";
import FollowersFollowing from "src/components/Profile/FollowersFollowing";
import Lists from "src/components/Profile/Lists";
import ProfileFollowingAndActions from "src/components/Profile/ProfileFollowingAndActions";
import ProfileUserActions from "src/components/Profile/ProfileUserActions";
import SessionProvider from "src/components/SessionProvider";
import { getServerAuthSession } from "src/server/auth";
import { api } from "src/trpc/server";

type Props = {
  params: {
    username: string;
  };
  searchParams: {
    list?: Lowercase<StatusType>;
  };
};

export const generateMetadata = ({ params }: Props): Metadata => {
  return {
    title: `${params.username} - Profile`,
  };
};

const UserPage = async ({ params, searchParams }: Props) => {
  const { username } = params;

  const list = (searchParams.list?.toUpperCase() ?? "WATCHING") as StatusType;

  const user = await api.user.get.query({ username });

  const session = await getServerAuthSession();

  if (!user) {
    redirect("/404");
  }

  if (!searchParams.list) {
    redirect(`/user/${username}?list=watching`);
  }

  return (
    <Container my={36}>
      <Group>
        <Image
          src={user.image!}
          alt="user profile"
          width={75}
          height={75}
          className="rounded-full"
        />
        <h1 className="text-2xl font-semibold">{username}</h1>

        <ProfileFollowingAndActions user={user} session={session} />
      </Group>
      <SessionProvider session={session}>
        <Lists selectedList={list} />
      </SessionProvider>
    </Container>
  );
};
export default UserPage;
