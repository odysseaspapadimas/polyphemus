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
  search: publicProcedure
    .input(
      z.object({
        query: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { results } = await tmdb.searchMulti({ query: input.query });

      return results?.slice(0, 5);
    }),
  spoilerSearch: publicProcedure
    .input(
      z.object({
        query: z.string(),
        type: z.enum(["MOVIE", "SHOW"]).nullable(),
      }),
    )
    .query(async ({ input }) => {
      if (input.type === "MOVIE") {
        const { results } = await tmdb.searchMovie({ query: input.query });

        return results?.slice(0, 5);
      } else if (input.type === "SHOW") {
        const { results } = await tmdb.searchTv({ query: input.query });

        return results?.slice(0, 5);
      }
    }),
  details: publicProcedure
    .input(
      z.object({
        id: z.number().nullish(),
        type: z.enum(["MOVIE", "SHOW"]).nullish(),
      }),
    )
    .query(async ({ input }) => {
      if (!input.id) return null;
      if (input.type === "MOVIE") {
        const info = await tmdb.movieInfo({ id: input.id });

        return info;
      } else {
        const info = await tmdb.tvInfo({ id: input.id });

        return info;
      }
    }),
  season: publicProcedure
    .input(
      z.object({
        id: z.number().nullish(),
        season: z.number().nullish(),
      }),
    )
    .query(async ({ input }) => {
      if (!input.id || !input.season) return null;
      const info = await tmdb.seasonInfo({
        id: input.id,
        season_number: input.season,
      });

      return info;
    }),
});
