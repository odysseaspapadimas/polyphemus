import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  exists: publicProcedure
    .input(
      z.object({
        username: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db.user.findUnique({
        where: {
          username: input.username,
        },
      });

      return res !== null;
    }),
  setUsername: protectedProcedure
    .input(
      z.object({
        username: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          username: input.username,
        },
      });

      if (res.username === input.username) {
        return true;
      }

      return false;
    }),
  get: publicProcedure
    .input(
      z.object({
        username: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const res = await ctx.db.user.findUnique({
        where: {
          username: input.username,
        },
        include: {
          watchListEntries: true,
        },
      });

      return res;
    }),
});
