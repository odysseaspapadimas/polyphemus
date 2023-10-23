import "@mantine/core/styles.css";
import "src/styles/globals.css";

import { Manrope } from "next/font/google";
import { headers } from "next/headers";

import { TRPCReactProvider } from "src/trpc/react";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import Header from "src/components/Header/Header";

const inter = Manrope({ subsets: ["latin"] });

export const metadata = {
  title: "Polyphemus",
  description: "Social media for movies and TV shows",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
        <link rel="shortcut icon" href="/favicon.svg" />
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
            <Header />
            {children}
          </MantineProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
