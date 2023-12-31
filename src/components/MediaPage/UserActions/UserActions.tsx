"use client";

import { api } from "src/trpc/react";
import type { Status } from "@prisma/client";
import useAddToList from "src/hooks/add-to-list";
import useRemoveFromList from "src/hooks/remove-from-list";
import UserAction from "./UserAction";
import type { MovieResponse, ShowResponse } from "moviedb-promise";

type Props = {
  mediaId: number;
  mediaImage: MovieResponse["poster_path"] | ShowResponse["poster_path"];
  mediaName: MovieResponse["title"];
  mediaType: "MOVIE" | "SHOW";
  status: Status | null;
};

const UserActions = ({
  mediaId,
  mediaType,
  mediaImage,
  mediaName,
  status,
}: Props) => {
  const listEntryStatus = api.list.getEntry.useQuery(
    {
      mediaId,
      mediaType,
    },
    { initialData: status ? { status } : undefined },
  );
  const addToList = useAddToList();

  const removeFromList = useRemoveFromList();

  const handleList = async ({ status }: { status: Status }) => {
    if (listEntryStatus.data?.status) {
      await removeFromList.mutateAsync({
        mediaId,
        mediaType,
        status: status,
        replace: listEntryStatus.data?.status !== status,
      });
    }
    if (status === "WATCHING") {
      if (listEntryStatus.data?.status !== "WATCHING") {
        addToList.mutate({ mediaId, mediaType, mediaImage, mediaName, status });
      }
    } else if (status === "PLAN_TO_WATCH") {
      if (listEntryStatus.data?.status !== "PLAN_TO_WATCH") {
        addToList.mutate({ mediaId, mediaType, mediaImage, mediaName, status });
      }
    } else if (status === "COMPLETED") {
      if (listEntryStatus.data?.status !== "COMPLETED") {
        addToList.mutate({ mediaId, mediaType, mediaImage, mediaName, status });
      }
    }
  };

  return (
    <div className="flex flex-col space-y-4 sm:ml-8">
      <div className="flex items-center justify-around space-x-8">
        <UserAction
          onList={listEntryStatus.data?.status}
          list={"WATCHING"}
          handleList={handleList}
        />

        <UserAction
          onList={listEntryStatus.data?.status}
          list={"PLAN_TO_WATCH"}
          handleList={handleList}
        />

        <UserAction
          onList={listEntryStatus.data?.status}
          list={"COMPLETED"}
          handleList={handleList}
        />

        {/* <PlanToWatch onList={onList} handler={handlePlan} />
        <Favorite onList={onList} handler={handleFavorite} />
        <Rate id={movieId} type={type} onList={onList} ratings={user.ratings} username={user.username} image_url={user.image_url} mutate={mutateOnList} /> */}
      </div>
      {/* <Recommend user={user.username} users={user.messages} movie={movie} /> */}
    </div>
  );
};
export default UserActions;
