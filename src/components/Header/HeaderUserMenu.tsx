"use client";

import { Avatar, Indicator, Menu, MenuItem, Modal } from "@mantine/core";
import { useState } from "react";
import SignInSignUp from "./SignInSignUp";
import type { Session } from "next-auth";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import UserMenuMessages from "./UserMenuMessages";
import { api } from "src/trpc/react";

type Props = {
  session: Session | null;
};

const HeaderUserMenu = ({ session }: Props) => {
  const [opened, setOpened] = useState(false);

  const unread = api.messages.unreadCount.useQuery(undefined, {
    enabled: !!session,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <>
      <Menu withArrow position="bottom-end" arrowPosition="center">
        <Menu.Target>
          <Indicator disabled={!unread.data || unread.data === 0}>
            <button className="border border-transparent transition-all duration-200 ease-in-out hover:border-primary">
              <Avatar
                src={session?.user.image ?? null}
                alt="Avatar"
                className="rounded-sm"
                imageProps={{
                  referrerPolicy: "no-referrer",
                }}
              />
            </button>
          </Indicator>
        </Menu.Target>
        <Menu.Dropdown>
          {!session ? (
            <Menu.Item
              component="button"
              onClick={() => {
                void signIn("google");
              }}
            >
              Sign-in
            </Menu.Item>
          ) : (
            <>
              <Menu.Item
                component={Link}
                href={`/user/${session.user.username}`}
              >
                <h2 className="text-lg font-bold text-white">
                  {session.user.username}
                </h2>
              </Menu.Item>

              <Menu.Divider />

              <UserMenuMessages unread={unread.data} />

              <MenuItem onClick={() => signOut()}>Sign-out</MenuItem>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        closeOnClickOutside
      >
        <SignInSignUp />
      </Modal>
    </>
  );
};

export default HeaderUserMenu;
