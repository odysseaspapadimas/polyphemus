import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messagesRouter = createTRPCRouter({
  getChats: protectedProcedure.query(async ({ ctx }) => {
    const res = await ctx.db.chat.findMany({
      where: {
        users: {
          some: {
            id: ctx.session.user.id,
          },
        },
      },
      include: {
        users: true,
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    return res;
  }),
  getChat: protectedProcedure
    .input(
      z.object({
        username: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const res = await ctx.db.chat.findFirst({
        where: {
          users: {
            every: {
              username: {
                in: [ctx.session.user.username!, input.username],
              },
            },
          },
        },
        include: {
          users: {
            select: {
              username: true,
              image: true,
            },
          },
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      return res;
    }),
});
