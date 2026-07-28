import "../styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Polyphemus — Repository Agent" },
      {
        name: "description",
        content: "One issue. One branch. One focused repository agent.",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 1_000 },
      mutations: { retry: 0 },
    },
  }));

  return (
    <Document>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </Document>
  );
}

function Document(props: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
