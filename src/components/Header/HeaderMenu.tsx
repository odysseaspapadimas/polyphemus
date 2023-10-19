"use client";

import { Avatar, Menu, MenuItem, Modal } from "@mantine/core";
import Image from "next/image";
import { useState } from "react";
import SignInSignUp from "./SignInSignUp";
import type { Session } from "next-auth";
import Link from "next/link";
import { signOut } from "next-auth/react";

type Props = {
  session: Session | null;
};
const HeaderMenu = ({ session }: Props) => {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Menu withArrow>
        <Menu.Target>
          <button className="hover:border-primary border border-transparent transition-all duration-200 ease-in-out">
            <Avatar
              src={session?.user.image ?? null}
              alt="Avatar"
              className="rounded-sm"
              imageProps={{
                referrerPolicy: "no-referrer",
              }}
            />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {!session ? (
            <Menu.Item
              component="button"
              onClick={() => {
                setOpened(true);
              }}
            >
              Sign-in
            </Menu.Item>
          ) : (
            <>
              <Menu.Item component={Link} href="/">
                <h2 className="text-lg font-bold text-white">
                  {session.user.name}
                </h2>
              </Menu.Item>

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

export default HeaderMenu;
