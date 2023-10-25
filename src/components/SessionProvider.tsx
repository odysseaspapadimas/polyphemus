"use client";

import type { Session } from "next-auth";
import { SessionProvider as AuthSessionProvider } from "next-auth/react";

export default function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}): React.ReactNode {
  return (
    <AuthSessionProvider session={session}>{children}</AuthSessionProvider>
  );
}
