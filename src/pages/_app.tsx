/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { api } from "src/utils/api";
import "src/styles/globals.css";
import { MantineProvider, createEmotionCache } from "@mantine/core";
import Header from "src/components/Header";
import AuthGuard from "src/helpers/AuthGuard";
import { NextComponentType, NextPage, NextPageContext } from "next";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"]
});

console.log(poppins, "poppins");
interface AppProps {
  pageProps: { session: Session | null };
  Component: NextComponentType<NextPageContext, any, {}> & {
    requireAuth: boolean;
  };
}

export type NextPageWithAuth<P = {}, IP = P> = NextPage<P, IP> & {
  requireAuth?: boolean;
};

const MyApp = ({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) => {
  const myCache = createEmotionCache({ key: "mantine" });

  return (
    <SessionProvider session={session}>
      <MantineProvider
        emotionCache={myCache}
        withGlobalStyles
        withNormalizeCSS
        theme={{
          /** Put your mantine theme override here */
          fontFamily: poppins.style.fontFamily,
          colorScheme: "dark",
          colors: {
            dark: [
              "#fff",
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
        <Header />
        {Component.requireAuth ? (
          <AuthGuard>
            <Component {...pageProps} />
          </AuthGuard>
        ) : (
          <Component {...pageProps} />
        )}
      </MantineProvider>
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
