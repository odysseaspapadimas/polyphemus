"use client";

import { Menu, ActionIcon } from "@mantine/core";
import type { Status } from "@prisma/client";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { IconDots, IconEye } from "@tabler/icons-react";
import type { MouseEvent } from "react";
import useAddToList from "src/hooks/add-to-list";
import useRemoveFromList from "src/hooks/remove-from-list";
import { api } from "src/trpc/react";

const listDict = {
  Completed: "COMPLETED",
  "Plan to Watch": "PLAN_TO_WATCH",
  Watching: "WATCHING",
};

type Props = {
  mediaId: number;
  mediaType: "MOVIE" | "SHOW";
};

const MediaMenu = ({ mediaId, mediaType }: Props) => {
  const listEntryQuery = api.list.getEntry.useQuery({
    mediaId,
    mediaType,
  });

  const addToList = useAddToList();

  const removeFromList = useRemoveFromList();

  const handleList = async (e: MouseEvent<HTMLButtonElement>) => {
    const value = e.currentTarget.innerText as keyof typeof listDict;
    const status = listDict[value] as Status

    if (listEntryQuery.data?.status) {
      await removeFromList.mutateAsync({
        mediaId,
        mediaType,
        status: status,
        replace: listEntryQuery.data?.status !== status,
      });
    }
    if (status === "WATCHING") {
      if (listEntryQuery.data?.status !== "WATCHING") {
        addToList.mutate({ mediaId, mediaType, status });
      }
    } else if (status === "PLAN_TO_WATCH") {
      if (listEntryQuery.data?.status !== "PLAN_TO_WATCH") {
        addToList.mutate({ mediaId, mediaType, status });
      }
    } else if (status === "COMPLETED") {
      if (listEntryQuery.data?.status !== "COMPLETED") {
        addToList.mutate({ mediaId, mediaType, status });
      }
    }
  };
  return (
    <div className="absolute right-2 top-2">
      <Menu>
        <Menu.Target>
          <ActionIcon
            className="transition-colors duration-75 hover:bg-dark-hover"
            variant="filled"
          >
            <IconDots />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Add to list</Menu.Label>
          <Menu.Item
            onClick={handleList}
            leftSection={
              <IconEye
                size={14}
                className={
                  listEntryQuery.data?.status === "WATCHING"
                    ? "text-primary"
                    : ""
                }
              />
            }
          >
            Watching
          </Menu.Item>
          <Menu.Item
            onClick={handleList}
            leftSection={
              <IconPlus
                size={14}
                className={
                  listEntryQuery.data?.status === "PLAN_TO_WATCH"
                    ? "text-primary"
                    : ""
                }
              />
            }
          >
            Plan to Watch
          </Menu.Item>
          <Menu.Item
            onClick={handleList}
            leftSection={
              <IconCheck
                size={14}
                className={
                  listEntryQuery.data?.status === "COMPLETED"
                    ? "text-primary"
                    : ""
                }
              />
            }
          >
            Completed
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};
export default MediaMenu;
