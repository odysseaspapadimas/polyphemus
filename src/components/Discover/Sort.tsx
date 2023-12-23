"use client";

import { Select } from "@mantine/core";
import type { DiscoverMovieRequest, DiscoverTvRequest } from "moviedb-promise";
import { usePathname } from "next/navigation";
import { useEffect, type Dispatch, type SetStateAction } from "react";

type Props = {
  filters: DiscoverMovieRequest | DiscoverTvRequest;
  setFilters: Dispatch<
    SetStateAction<DiscoverMovieRequest | DiscoverTvRequest>
  >;
};

const Sort = ({ filters, setFilters }: Props) => {
  const pathname = usePathname();

  const type = pathname === "/movies" ? "movies" : "shows";

  const selectData = [
    { value: "popularity.desc", label: "Popularity Descending" },
    { value: "popularity.asc", label: "Popularity Ascending" },
    { value: "vote_average.desc", label: "Rating Descending" },
    { value: "vote_average.asc", label: "Rating Ascending" },
    {
      value: type === "movies" ? "release_date.desc" : "first_air_date.desc",
      label: "Release Date Descending",
    },
    {
      value: type === "movies" ? "release_date.asc" : "first_air_date.asc",
      label: "Release Date Ascending",
    },
  ];


  return (
    <div>
      <p>Sort by</p>
      <Select
        className="min-w-fit self-center"
        value={filters?.sort_by ?? selectData[0]?.value}
        onChange={(value) => {
          if (value === selectData[0]?.value) {
            // Create a new filters object excluding 'sort_by'
            const newFilters = { ...filters };
            delete newFilters.sort_by;
            setFilters({ ...newFilters });
          } else if (value) {
            // Create a new filters object including the updated 'sort_by'
            const newFilters = { ...filters, sort_by: value };
            setFilters({ ...newFilters });
          }

          // router.push(createUrl("/" + type, newParams));
        }}
        data={selectData}
      />
    </div>
  );
};
export default Sort;
