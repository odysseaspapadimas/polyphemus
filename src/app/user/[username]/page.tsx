import { Container } from "@mantine/core";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { StatusType } from "prisma/generated/zod";
import Lists from "src/components/Profile/Lists";
import ProfileFollowingAndActions from "src/components/Profile/ProfileFollowingAndActions";
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
      <div className="flex flex-col items-center md:flex-row">
        <Image
          src={user.image!}
          alt="user profile"
          width={75}
          height={75}
          className="rounded-full"
        />
        <h1 className="mt-2 text-2xl font-semibold md:ml-4 md:mt-0">
          {username}
        </h1>

        <ProfileFollowingAndActions user={user} session={session} />
      </div>
      <SessionProvider session={session}>
        <Lists selectedList={list} />
      </SessionProvider>
    </Container>
  );
};
export default UserPage;
