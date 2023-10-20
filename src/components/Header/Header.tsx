import { Container } from "@mantine/core";
import Link from "next/link";
import HeaderMenu from "./HeaderMenu";
import { getServerAuthSession } from "src/server/auth";

const Header = async () => {
  const session = await getServerAuthSession();

  return (
    <header className="border-b border-[#2C2E33]">
      <Container size="md" h={70} className="flex items-center justify-between">
        <Link href="/" className="font-bold text-2xl text-white">
          Polyphemus
        </Link>

        <HeaderMenu session={session} />
      </Container>
    </header>
  );
};

export default Header;
