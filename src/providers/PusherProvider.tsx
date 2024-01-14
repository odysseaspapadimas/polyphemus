"use client";

import type { Session } from "next-auth";
import Pusher from "pusher-js";
import { createContext, useEffect, useRef, useState } from "react";
import { env } from "src/env.mjs";
import { api } from "src/trpc/react";

type PusherContextType = {
  pusher: Pusher | null;
  socketId: string | undefined;
};

export const PusherContext = createContext<PusherContextType>({
  pusher: null,
  socketId: undefined,
});

const PusherProvider = ({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) => {
  const [pusher, setPusher] = useState<PusherContextType["pusher"]>(null);
  useEffect(() => {
    if (!session) return;
    const pusher = new Pusher(env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: "mt1",
    });
    setPusher(pusher);

    return () => {
      pusher.disconnect();
      setPusher(null);
    };
  }, [session]);

  const [socketId, setSocketId] =
    useState<PusherContextType["socketId"]>(undefined);

  const utils = api.useContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (!pusher || !session) return;
    if (!initialized.current) {
      initialized.current = true;
      const username = session.user.username;
      if (!username) return;

      const channel = pusher.subscribe(username);

      channel.bind("read", async ({ username }: { username: string }) => {
        console.log("read", username);
        //this gets triggered by the receiver
        await utils.messages.getChat.refetch({ username });
        await utils.messages.getChats.refetch();
        // await utils.messages.unreadCount.refetch();
      });
      channel.bind("message", async ({ username }: { username: string }) => {
        console.log("message received", username);
        //this gets triggered by the sender
        await utils.messages.getChat.refetch({ username });
        await utils.messages.getChats.refetch();
        await utils.messages.unreadCount.refetch();
      });
    }

    // return () => {
    //   pusher.unsubscribe("chat");
    // };
  }, [
    utils.messages.getChat,
    utils.messages.getChats,
    utils.messages.unreadCount,
    session,
    pusher,
  ]);

  useEffect(() => {
    if (!pusher) return;
    pusher.connection.bind("connected", () => {
      setSocketId(pusher.connection.socket_id);
    });
  }, [pusher]);

  return (
    <PusherContext.Provider value={{ pusher, socketId }}>
      {children}
    </PusherContext.Provider>
  );
};
export default PusherProvider;
