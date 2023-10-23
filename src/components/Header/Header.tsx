import { Container } from "@mantine/core";
import { getServerAuthSession } from "src/server/auth";
import HeaderUserMenu from "./HeaderUserMenu";
import HeaderMenu from "./HeaderMenu";

const Header = async () => {
  const session = await getServerAuthSession();

  return (
    <header className="border-b border-[#2C2E33]">
      <Container size="md" h={70} className="flex items-center justify-between">
        <HeaderMenu />

        <HeaderUserMenu session={session} />
      </Container>
    </header>
  );
};

export default Header;
