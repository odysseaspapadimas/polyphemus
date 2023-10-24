"use client";

import { Burger, Drawer, Group } from "@mantine/core";
import Link from "next/link";
import { useState } from "react";

const HeaderMenu = () => {
  const [navOpened, setNavOpened] = useState(false);

  return (
    <div className="flex items-center justify-center">
      <Drawer
        opened={navOpened}
        onClose={() => setNavOpened(false)}
        onClick={() => setNavOpened(false)}
        withCloseButton={false}
        padding="xl"
        size="75%"
        styles={{
          inner: {
            marginTop: "71px",
          },
          overlay: {
            marginTop: "71px",
          },
        }}
      >
        <NavLinks />
      </Drawer>

      <Group justify="space-between">
        <div className="sm:hidden">
          <Burger
            opened={navOpened}
            onClick={() => setNavOpened((o) => !o)}
            size="sm"
            className="!bg-transparent"
          />
        </div>
        <Link href="/" className="text-2xl font-bold text-white">
          Polyphemus
        </Link>

        <div className="hidden sm:block">
          <div className="ml-6 flex-[2]">
            <NavLinks />
          </div>
        </div>
      </Group>
    </div>
  );
};
export default HeaderMenu;

const NavLinks = () => (
  <div className="flex flex-col items-center space-y-4 text-xl sm:text-base md:flex-row md:space-x-4 md:space-y-0">
    <Link href="/movies">
      <span className="font-semibold text-gray-300 hover:text-white">
        Movies
      </span>
    </Link>
    <Link href="/shows">
      <span className="font-semibold text-gray-300 hover:text-white">
        Shows
      </span>
    </Link>
  </div>
);
