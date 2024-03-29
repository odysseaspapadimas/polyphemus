import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import '@mantine/dates/styles.css';
import "src/styles/globals.css";

import { Manrope } from "next/font/google";
import { headers } from "next/headers";

import { TRPCReactProvider } from "src/trpc/react";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import Header from "src/components/Header/Header";
import CheckUsername from "src/components/CheckUsername/CheckUsername";
import { Notifications } from "@mantine/notifications";
import PusherProvider from "src/providers/PusherProvider";
import { getServerAuthSession } from "src/server/auth";

const inter = Manrope({ subsets: ["latin"] });

export const metadata = {
  title: "Polyphemus",
  description: "Social media for movies and TV shows",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
        <link rel="shortcut icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        <TRPCReactProvider headers={headers()}>
          <MantineProvider
            defaultColorScheme="dark"
            theme={{
              colors: {
                dark: [
                  "#FFFFFF",
                  "#A6A7AB",
                  "#909296",
                  "#5C5F66",
                  "#373A40",
                  "#2C2E33",
                  "#25262B",
                  "#1A1B1E",
                  "#141517",
                  "#101113",
                ],
              },
            }}
          >
            <Notifications />
            <CheckUsername />
            <PusherProvider session={session}>
              <Header />
              {children}
            </PusherProvider>
          </MantineProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
