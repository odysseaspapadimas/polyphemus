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

      if (!res) {
        const user = await ctx.db.user.findUnique({
          where: {
            username: input.username,
          },
          select: {
            username: true,
            image: true,
          },
        });
        return { chat: null, user };
      }

      return { chat: res };
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
        const res = await ctx.db.chat.create({
          data: {
            users: {
              connect: [
                {
                  username: ctx.session.user.username!,
                },
                {
                  username: input.to,
                },
              ],
            },
          },
          include: {
            users: true,
          },
        });

        await ctx.db.message.create({
          data: {
            content: input.content,
            chatId: res.id,
            senderUsername: ctx.session.user.username!,
          },
        });

        await pusher.trigger(
          input.to,
          "message",
          { username: ctx.session.user.username! },
          {
            //exclude myself
            socket_id: input.socketId,
          },
        );

        return res;
      }

      const res = await ctx.db.message.create({
        data: {
          content: input.content,
          chatId: chat.id,
          senderUsername: ctx.session.user.username!,
        },
      });

      await ctx.db.chat.update({
        where: {
          id: chat.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      await pusher.trigger(
        input.to,
        "message",
        { username: ctx.session.user.username! },
        {
          //exclude myself
          socket_id: input.socketId,
        },
      );

      return res;
    }),
  read: protectedProcedure
    .input(
      z.object({
        chatId: z.string(),
        socketId: z.string().optional(),
        username: z.string(),
      }),
    )
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

      await pusher.trigger(input.username, "read", {
        username: ctx.session.user.username!,
      });
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
  searchUsers: protectedProcedure
    .input(
      z.object({
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const res = await ctx.db.user.findMany({
        where: {
          username: {
            contains: input.query,
            mode: "insensitive",
          },
          id: {
            not: ctx.session.user.id,
          },
        },
        select: {
          username: true,
          image: true,
        },
      });

      return res;
    }),
  suggestedUsers: protectedProcedure.query(async ({ ctx }) => {
    // Find all the users that the current user is following but hasn't messaged with
    const suggestedUsers = await ctx.db.user.findMany({
      where: {
        followers: {
          some: {
            id: ctx.session.user.id,
          },
        },
        chats: {
          none: {
            users: {
              some: {
                id: ctx.session.user.id,
              },
            },
          },
        },
      },
      select: {
        username: true,
        image: true,
      },
    });

    return suggestedUsers;
  }),
  deleteChat: protectedProcedure
    .input(
      z.object({
        chatId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: {
          id: input.chatId,
          users: {
            some: {
              id: ctx.session.user.id,
            },
          },
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      await ctx.db.chat.delete({
        where: {
          id: input.chatId,
        },
      });
    }),
});
