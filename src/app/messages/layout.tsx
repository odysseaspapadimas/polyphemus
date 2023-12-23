import { Container } from "@mantine/core";
import { redirect } from "next/navigation";
import MessagesLayout from "src/components/Messages/MessagesLayout";
import { getServerAuthSession } from "src/server/auth";
import { api } from "src/trpc/server";

const MessagesLayoutPage = async ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const chats = await api.messages.getChats.query();

  const session = await getServerAuthSession();

  if (!session) {
    redirect("/");
  }

  return (
    <Container className="flex">
      <MessagesLayout initialChats={chats} session={session}>
        {children}
      </MessagesLayout>
    </Container>
  );
};
export default MessagesLayoutPage;
