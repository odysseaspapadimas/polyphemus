"use client";

import { Center, Loader, Tabs } from "@mantine/core";
import type { StatusType } from "prisma/generated/zod";
import { api } from "src/trpc/react";
import ProfileMedia from "./ProfileMedia";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

type Props = {
  status: StatusType;
};

const List = ({ status }: Props) => {
  const params = useParams();
  const username = params.username as string;

  const { data: session } = useSession();

  const listQuery = api.list.get.useQuery({ status, username });

  if (listQuery.isLoading || !listQuery.data) {
    return (
      <Center my={36}>
        <Loader />
      </Center>
    );
  }

  const moviesLength = listQuery.data.movies.length;
  const showsLength = listQuery.data.shows.length;

  return (
    <Tabs
      className="mt-4"
      variant="pills"
      color="gray"
      classNames={{
        list: "flex flex-nowrap overflow-x-scroll-auto sm:overflow-x-hidden mb-4",
        panel:
          "flex flex-wrap gap-y-2 sm:gap-4 justify-around sm:justify-start",
      }}
      defaultValue="both"
    >
      <Tabs.List>
        <Tabs.Tab value="both">
          <TabLabel text="Both" length={moviesLength + showsLength} />
        </Tabs.Tab>
        <Tabs.Tab value="movies">
          <TabLabel text="Movies" length={moviesLength} />
        </Tabs.Tab>
        <Tabs.Tab value="shows">
          <TabLabel text="TV Shows" length={showsLength} />
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="both">
        {moviesLength + showsLength === 0 ? (
          <p>No items on this list...</p>
        ) : (
          <>
            {listQuery.data.movies.map((movie) => (
              <ProfileMedia key={movie.id} data={movie} session={session} />
            ))}
            {listQuery.data.shows.map((show) => (
              <ProfileMedia key={show.id} data={show} session={session} />
            ))}
          </>
        )}
      </Tabs.Panel>
      <Tabs.Panel value="movies">
        {moviesLength === 0 ? (
          <p>No items on this list...</p>
        ) : (
          listQuery.data.movies.map((movie) => (
            <ProfileMedia key={movie.id} data={movie} session={session} />
          ))
        )}
      </Tabs.Panel>
      <Tabs.Panel value="shows">
        {showsLength === 0 ? (
          <p>No items on this list...</p>
        ) : (
          listQuery.data.shows.map((show) => (
            <ProfileMedia key={show.id} data={show} session={session} />
          ))
        )}
      </Tabs.Panel>
    </Tabs>
  );
};
export default List;

type TabLabelProps = {
  text: string;
  length: number;
};

const TabLabel = ({ text, length }: TabLabelProps) => {
  return (
    <div className="flex items-center space-x-2 whitespace-nowrap">
      <p>{text}</p>
      <div className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs">
        {length}
      </div>
    </div>
  );
};
