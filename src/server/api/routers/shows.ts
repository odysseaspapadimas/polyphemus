import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { tmdb } from "src/utils/tmdb";

export const showsRouter = createTRPCRouter({
  discover: publicProcedure
    .input(
      z.object({
        page: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { results } = await tmdb.discoverTv({ page: input.page });

      return results;
    }),
});
