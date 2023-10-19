import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "src/server/api/trpc";
import {
  MediaTypeSchema,
  StatusSchema,
} from "../../../../prisma/generated/zod";

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
});
