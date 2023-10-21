import { Container } from "@mantine/core";
import Link from "next/link";
import HeaderMenu from "./HeaderMenu";
import { getServerAuthSession } from "src/server/auth";

const Header = async () => {
  const session = await getServerAuthSession();

  return (
    <header className="border-b border-[#2C2E33]">
      <Container size="md" h={70} className="flex items-center justify-between">
        <div className="flex items-center justify-center">
          <Link href="/" className="text-2xl font-bold text-white">
            Polyphemus
          </Link>

          <div className="ml-6">
            <Link href="/shows">Shows</Link>
          </div>
        </div>

        <HeaderMenu session={session} />
      </Container>
    </header>
  );
};

export default Header;
