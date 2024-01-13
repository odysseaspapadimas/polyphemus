import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { tmdb } from "src/lib/tmdb";
import { MediaTypeSchema } from "prisma/generated/zod";

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
  friendActivity: protectedProcedure
    .input(
      z.object({
        mediaId: z.number(),
        mediaType: MediaTypeSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const user = await ctx.db.user.findUnique({
          where: {
            id: ctx.session.user.id,
            following: {
              some: {
                watchListEntries: {
                  some: {
                    mediaId: input.mediaId,
                    mediaType: input.mediaType,
                  },
                },
              },
            },
          },
          include: {
            following: {
              select: {
                username: true,
                image: true,
                watchListEntries: {
                  where: {
                    mediaId: input.mediaId,
                    mediaType: input.mediaType,
                  },
                  select: {
                    status: true,
                  },
                },
              },
            },
          },
        });

        if (!user) {
          // Handle case when the user is not found
          return null; // or throw an error, depending on your use case
        }

        // Do something with the relevantFollowings data
        return user.following.map((following) => ({
          username: following.username,
          image: following.image,
          status: following.watchListEntries[0]?.status,
        })).filter((following) => following.status !== undefined);
      } catch (error) {
        console.error("Error:", error);
        throw error; // Handle the error appropriately, log it, or throw a custom error
      }
    }),
});
