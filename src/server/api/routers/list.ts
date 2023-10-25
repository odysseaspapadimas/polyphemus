import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "src/server/api/trpc";
import {
  MediaTypeSchema,
  StatusSchema,
} from "../../../../prisma/generated/zod";
import { tmdb } from "src/utils/tmdb";
import type { MovieResponse, ShowResponse } from "moviedb-promise";

export const listRouter = createTRPCRouter({
  getEntry: protectedProcedure
    .input(z.object({ mediaId: z.number(), mediaType: MediaTypeSchema }))
    .query(async ({ ctx, input }) => {
      const res = await ctx.db.watchlistEntry.findUnique({
        where: {
          userId_mediaId_mediaType: {
            userId: ctx.session.user.id,
            mediaId: input.mediaId,
            mediaType: input.mediaType,
          },
        },
        select: {
          status: true,
        },
      });
      return res;
    }),
  add: protectedProcedure
    .input(
      z.object({
        mediaId: z.number(),
        mediaType: MediaTypeSchema,
        status: StatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.watchlistEntry.create({
        data: {
          userId: ctx.session?.user.id,
          ...input,
        },
      });
      return res;
    }),
  remove: protectedProcedure
    .input(
      z.object({
        mediaId: z.number(),
        mediaType: MediaTypeSchema,
        status: StatusSchema,
        replace: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.watchlistEntry.delete({
        where: {
          userId_mediaId_mediaType: {
            userId: ctx.session.user.id,
            mediaId: input.mediaId,
            mediaType: input.mediaType,
          },
        },
      });

      return res;
    }),
  get: publicProcedure
    .input(z.object({ status: StatusSchema, username: z.string() }))
    .query(async ({ ctx, input }) => {
      const list = await ctx.db.watchlistEntry.findMany({
        where: {
          user: {
            username: input.username,
          },
          status: input.status,
        },
        select: {
          mediaId: true,
          mediaType: true,
        },
      });

      const movieList = [] as MovieResponse[];
      const showList = [] as ShowResponse[];
      for (const entry of list) {
        if (entry.mediaType === "MOVIE") {
          const movie = await tmdb.movieInfo({ id: entry.mediaId });
          movieList.push(movie);
        } else if (entry.mediaType === "SHOW") {
          const show = await tmdb.tvInfo({ id: entry.mediaId });
          showList.push(show);
        }
      }

      return { movies: movieList, shows: showList };
    }),
});
