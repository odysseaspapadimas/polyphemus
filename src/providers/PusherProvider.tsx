"use client";

import Pusher from "pusher-js";
import { createContext, useEffect, useMemo, useState } from "react";
import { env } from "src/env.mjs";

type PusherContextType = {
  pusher: Pusher | null;
  socketId: string | undefined;
};

export const PusherContext = createContext<PusherContextType>({
  pusher: null,
  socketId: undefined,
});

const PusherProvider = ({ children }: { children: React.ReactNode }) => {
  const pusher = useMemo(
    () =>
      new Pusher(env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: "mt1",
      }),
    [],
  );

  const [socketId, setSocketId] =
    useState<PusherContextType["socketId"]>(undefined);

  useEffect(() => {
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
