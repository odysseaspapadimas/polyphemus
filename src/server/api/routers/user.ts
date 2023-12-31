import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  MediaTypeSchema,
  StatusSchema,
  UserSchema,
} from "prisma/generated/zod";

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
        username: z.string().optional(),
        following: UserSchema.array().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const res = await ctx.db.user.findUnique({
        where: {
          username: input.username,
        },
        include: {
          watchListEntries: true,
          followers: {
            include: {
              _count: {
                select: {
                  followers: true,
                  following: true,
                },
              },
            },
          },
          following: {
            include: {
              _count: {
                select: {
                  followers: true,
                  following: true,
                },
              },
            },
          },
        },
      });

      return res;
    }),
  search: publicProcedure
    .input(z.object({ usernameQuery: z.string() }))
    .query(async ({ input, ctx }) => {
      const res = await ctx.db.user.findMany({
        where: {
          username: {
            contains: input.usernameQuery,
            mode: "insensitive",
          },
        },
        select: {
          image: true,
          username: true,
          _count: {
            select: {
              followers: true,
              following: true,
            },
          },
        },
      });

      return res;
    }),
  toggleFollow: protectedProcedure
    .input(
      z.object({
        username: z.string(),
        follow: z.boolean(),
        followingArray: UserSchema.array().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.follow) {
        const res = await ctx.db.user.update({
          where: {
            username: input.username,
          },
          data: {
            followers: {
              connect: {
                id: ctx.session.user.id,
              },
            },
          },
        });

        return res;
      } else if (!input.follow) {
        const res = await ctx.db.user.update({
          where: {
            username: input.username,
          },
          data: {
            followers: {
              disconnect: {
                id: ctx.session.user.id,
              },
            },
          },
        });

        return res;
      }
    }),
  activity: protectedProcedure.query(async ({ ctx }) => {
    //get all activity of users the user follows
    const { following } =
      (await ctx.db.user.findUnique({
        where: {
          id: ctx.session.user.id,
        },
        select: {
          following: {
            select: {
              username: true,
            },
          },
        },
      })) || {};

    if (!following) {
      return [];
    }

    const res = await ctx.db.activity.findMany({
      where: {
        user: {
          username: {
            in: following
              .filter((user) => user.username !== null)
              .map((user) => user.username!),
          },
        },
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res;
  }),
  addActivity: protectedProcedure
    .input(
      z.object({
        mediaId: z.number(),
        mediaType: MediaTypeSchema,
        mediaImage: z.string().nullish(),
        mediaName: z.string().optional(),
        status: StatusSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db.activity.create({
        data: {
          userId: ctx.session.user.id,
          mediaId: input.mediaId,
          mediaType: input.mediaType,
          mediaImage: input.mediaImage,
          mediaName: input.mediaName,
          status: input.status,
        },
      });

      return res;
    }),
  removeActivity: protectedProcedure
    .input(
      z.object({
        mediaId: z.number(),
        mediaType: MediaTypeSchema,
        status: StatusSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db.activity.delete({
        where: {
          userId_mediaId_mediaType_status: {
            userId: ctx.session.user.id,
            mediaId: input.mediaId,
            mediaType: input.mediaType,
            status: input.status,
          },
        },
      });

      return res;
    }),
});
