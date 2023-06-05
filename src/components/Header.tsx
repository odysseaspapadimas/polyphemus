import {
  Header as MantineHeader,
  Burger,
  MediaQuery,
  Container,
  Modal,
  Avatar,
  Menu,
  Divider,
  Group,
  Drawer,
  type TabsValue,
} from "@mantine/core";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { type Session } from "next-auth";
import Link from "next/link";
import SignInSignUp from "./SignInSignUp";
import SignupModal from "./SignupModal";

const Header = () => {
  const [opened, setOpened] = useState(false);
  const [navOpened, setNavOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<TabsValue>("sign-in"); //Tab for sign-in/up modal

  const { data: session } = useSession();

  return (
    <>
      {session?.user?.username === null && <SignupModal />}
      <MantineHeader height={70}>
        <Container className="grid h-full ">
          <Group position="apart">
            <MediaQuery
              largerThan="sm"
              styles={{ display: "none" }}
              className=""
            >
              <Burger
                opened={navOpened}
                onClick={() => setNavOpened((o) => !o)}
                size="sm"
              />
            </MediaQuery>
            <Link href="/" className="mx-auto text-2xl font-bold sm:mx-0">
              {/*pt-3 -mr-4 */}
              Polyphemus
              {/* <Image src="/logo.png" width={187.31} height={30} layout="fixed" /> */}
            </Link>

            <MediaQuery smallerThan="sm" styles={{ display: "none" }}>
              <div className="ml-4 mr-auto flex-1">
                <NavLinks session={session} />
              </div>
            </MediaQuery>

            <Group>
              <Menu
                position="bottom-end"
                withArrow
                classNames={{ item: "text-base" }}
              >
                <Menu.Target>
                  <div className="cursor-pointer">
                    <div className="hover:border-primary rounded-sm border border-transparent">
                      <Avatar
                        src={session?.user?.image}
                        className="rounded-sm"
                      />
                    </div>
                  </div>
                </Menu.Target>
                <Menu.Dropdown className="-translate-x-[8px]">
                  {session ? (
                    <>
                      <Menu.Item component={Link} href={``}>
                        <p className="text-lg font-semibold ">
                          {session.user.username}
                        </p>
                      </Menu.Item>
                      <Divider my="xs" className="" />

                      <Menu.Item disabled={true}>Settings</Menu.Item>

                      <Divider my="xs" labelPosition="center" />
                      <Menu.Item onClick={() => void signOut()}>
                        Sign-out
                      </Menu.Item>
                    </>
                  ) : (
                    <>
                      <Menu.Item
                        onClick={() => {
                          setOpened(true);
                          setActiveTab("sign-in");
                        }}
                      >
                        Sign-in
                      </Menu.Item>
                      <Divider />
                      <Menu.Item
                        onClick={() => {
                          setOpened(true);
                          setActiveTab("sign-up");
                        }}
                      >
                        Sign-up
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Container>
      </MantineHeader>

      <Modal
        closeOnClickOutside={true}
        opened={opened}
        onClose={() => setOpened(false)}
      >
        <SignInSignUp
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setOpened={setOpened}
        />
      </Modal>

      <Drawer
        opened={navOpened}
        onClose={() => setNavOpened(false)}
        onClick={() => setNavOpened(false)}
        withCloseButton={false}
        withinPortal={false}
        closeOnClickOutside
        classNames={{
          inner: "paper-parent",
        }}
        styles={{
          inner: {
            width: "75%",
          },
          overlay: {
            top: "70px",
          },
        }}
      >
        <NavLinks session={session} />
      </Drawer>
    </>
  );
};

export default Header;

const NavLinks = ({ session }: { session: Session | null }) => (
  <div className="flex flex-col items-center space-y-4 text-xl sm:text-base md:flex-row md:space-x-4 md:space-y-0">
    <Link href="/movies">
      <span className="whitespace-nowrap font-semibold text-gray-300 hover:text-white">
        Movies
      </span>
    </Link>
    <Link href="/shows">
      <span className="whitespace-nowrap font-semibold text-gray-300 hover:text-white">
        TV Shows
      </span>
    </Link>

    {session && (
      <Link href="/schedule">
        <span className="whitespace-nowrap font-semibold text-gray-300 hover:text-white">
          Schedule
        </span>
      </Link>
    )}
  </div>
);

// const Notifications = ({ num }: { num: number }) => (
//   <div className="bg-primary ml-6 grid h-5 w-5 place-items-center rounded-full text-xs font-medium">
//     {num}
//   </div>
// );
