"use client";

import { Menu } from "@mantine/core";
import Link from "next/link";

type Props = {
  unread: number | undefined;
};

const UserMenuMessages = ({ unread }: Props) => {
  return (
    <Menu.Item
      component={Link}
      href={`/messages`}
      rightSection={<Notifications num={unread ?? 0} />}
    >
      Messages
    </Menu.Item>
  );
};
export default UserMenuMessages;

const Notifications = ({ num }: { num: number }) => (
  <div className="ml-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-xs font-medium">
    {num}
  </div>
);
