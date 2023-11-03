import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import Pusher from "pusher";
import { env } from "src/env.mjs";

const pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: "mt1",
  useTLS: true,
});

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
  send: protectedProcedure
    .input(
      z.object({
        to: z.string(),
        content: z.string(),
        socketId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: {
          users: {
            every: {
              username: {
                in: [ctx.session.user.username!, input.to],
              },
            },
          },
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      const res = await ctx.db.message.create({
        data: {
          content: input.content,
          chatId: chat.id,
          senderUsername: ctx.session.user.username!,
        },
      });

      await pusher.trigger(
        "chat",
        "message",
        {},
        {
          //exclude myself
          socket_id: input.socketId,
        },
      );

      return res;
    }),
  read: protectedProcedure
    .input(z.object({ chatId: z.string(), socketId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      //update last message to read
      await ctx.db.message.updateMany({
        where: {
          chatId: input.chatId,
          senderUsername: {
            not: ctx.session.user.username!,
          },
        },
        data: {
          read: true,
        },
      });

      await pusher.trigger("chat", "message", {});
    }),
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const res = await ctx.db.chat.count({
      where: {
        users: {
          some: {
            id: ctx.session.user.id,
          },
        },
        messages: {
          some: {
            read: false,
            senderUsername: {
              not: ctx.session.user.username!,
            },
          },
        },
      },
    });

    return res;
  }),
});
