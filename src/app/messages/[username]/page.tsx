import { IconArrowLeft } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import Message from "src/components/Messages/Message";
import MessagesBox from "src/components/Messages/MessagesBox";
import { getServerAuthSession } from "src/server/auth";
import { api } from "src/trpc/server";

const MessagePage = async ({ params }: { params: { username: string } }) => {
  const { username } = params;

  const session = await getServerAuthSession();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="relative w-full">
      <MessagesBox username={username} session={session} />
    </div>
  );
};
export default MessagePage;
