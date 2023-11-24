import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { tmdb } from "src/lib/tmdb";

export const mediaRouter = createTRPCRouter({
  discover: publicProcedure
    .input(
      z.object({
        page: z.number(),
        type: z.enum(["MOVIE", "SHOW"]),
      }),
    )
    .query(async ({ input }) => {
      if (input.type === "MOVIE") {
        const { results } = await tmdb.discoverMovie({ page: input.page });

        return results;
      } else {
        const { results } = await tmdb.discoverTv({ page: input.page });

        return results;
      }
    }),
  getGenres: publicProcedure
    .input(
      z.object({
        type: z.enum(["MOVIE", "SHOW"]),
      }),
    )
    .query(async ({ input }) => {
      if (input.type === "MOVIE") {
        const { genres } = await tmdb.genreMovieList();

        return genres;
      } else {
        const { genres } = await tmdb.genreTvList();

        return genres;
      }
    }),
});
