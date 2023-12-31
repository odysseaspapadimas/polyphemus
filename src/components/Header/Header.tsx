import { Container, Group } from "@mantine/core";
import { getServerAuthSession } from "src/server/auth";
import HeaderUserMenu from "./HeaderUserMenu";
import HeaderMenu from "./HeaderMenu";
import Search from "./Search";
import Activity from "./Activity";

const Header = async () => {
  const session = await getServerAuthSession();

  return (
    <header className="border-b border-[#2C2E33]">
      <Container size="md" h={70} className="flex items-center justify-between">
        <HeaderMenu />

        <Group gap="lg">
          <Search />
          {session && <Activity />}
          <HeaderUserMenu session={session} />
        </Group>
      </Container>
    </header>
  );
};

export default Header;
