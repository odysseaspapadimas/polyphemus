"use client";

import { Button, Skeleton } from "@mantine/core";
import type { DiscoverMovieRequest, DiscoverTvRequest } from "moviedb-promise";
import { usePathname } from "next/navigation";
import React from "react";
import { api } from "src/trpc/react";

type Props = {
  filters: DiscoverMovieRequest | DiscoverTvRequest;
  setFilters: React.Dispatch<
    React.SetStateAction<DiscoverMovieRequest | DiscoverTvRequest>
  >;
};
const Genres = ({ filters, setFilters }: Props) => {
  const pathname = usePathname();
  const type = pathname === "/movies" ? "MOVIE" : "SHOW";
  const genresList = api.media.getGenres.useQuery(
    { type },
    {
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const handleGenre = (id: number | undefined) => {
    const newFilters = filters;

    if (!newFilters.with_genres) {
      newFilters.with_genres = "";
    }

    if (
      !filters.with_genres?.includes(",") &&
      filters.with_genres?.includes(String(id))
    ) {
      newFilters.with_genres = "";
    } else if (filters.with_genres?.includes(String(id))) {
      newFilters.with_genres = filters.with_genres.replace(`,${id}`, "");
      newFilters.with_genres = filters.with_genres.replace(`${id}`, "");
    } else if (newFilters.with_genres.length === 0) {
      newFilters.with_genres += `${id}`;
    } else {
      newFilters.with_genres += `,${id}`;
    }
    setFilters({ ...newFilters });
  };

  return (
    <div className="mt-4">
      <h2>Genres</h2>
      <div className="mb-4 mt-2 flex max-w-fit flex-wrap items-center">
        {genresList.isLoading
          ? new Array(19).fill(0).map((_, i) => (
              <Skeleton
                key={i}
                className="mx-2 mb-2 h-[34px] rounded-xl border border-gray-400 !bg-transparent px-2 hover:border-transparent hover:!bg-primary"
                style={{
                  width: Math.floor(Math.random() * (85 - 61 + 1)) + 61,
                }}
              ></Skeleton>
            ))
          : genresList.data?.map(({ id, name }) => (
              <Button
                key={id}
                onClick={() => handleGenre(id)}
                className={`mb-2 mr-2 rounded-xl border border-gray-400 px-2 hover:border-transparent hover:!bg-primary ${
                  filters.with_genres?.includes(String(id))
                    ? "border-transparent !bg-[#1864AB]"
                    : "!bg-transparent"
                }`}
              >
                {name}
              </Button>
            ))}
      </div>
    </div>
  );
};
export default Genres;
