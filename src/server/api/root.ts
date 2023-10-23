import { createTRPCRouter } from "src/server/api/trpc";
import { listRouter } from "./routers/list";
import { mediaRouter } from "./routers/media";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */

export const appRouter = createTRPCRouter({
  list: listRouter,
  media: mediaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
