import { redirect } from "next/navigation";
import Chat from "src/components/Messages/Chat";
import { getServerAuthSession } from "src/server/auth";

const MessagePage = async ({ params }: { params: { username: string } }) => {
  const session = await getServerAuthSession();
  const { username } = params;

  if (!session) {
    redirect("/");
  }

  return <Chat username={username} session={session} />;
};
export default MessagePage;
