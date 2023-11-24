"use client";

import { Button, RangeSlider, type RangeSliderValue } from "@mantine/core";
import Sort from "./Sort";
import { Suspense, useState } from "react";
import type { DiscoverMovieRequest, DiscoverTvRequest } from "moviedb-promise";
import Genres from "./Genres";

const Filters = () => {
  const [filters, setFilters] = useState<
    DiscoverMovieRequest | DiscoverTvRequest
  >({});

  const handleVote = (value: RangeSliderValue) => {
    const newFilters = filters;
    newFilters["vote_average.gte"] = value[0] / 10;
    newFilters["vote_average.lte"] = value[1] / 10;

    setFilters(newFilters);
  };

  return (
    <div>
      <Sort />
      <h2>Rating</h2>
      <RangeSlider
        mb={32}
        onChangeEnd={handleVote}
        marks={[
          { value: 0, label: "0.0" },
          { value: 10 },
          { value: 20 },
          { value: 30 },
          { value: 40 },
          { value: 50 },
          { value: 60 },
          { value: 70 },
          { value: 80 },
          { value: 90 },
          { value: 100, label: "10" },
        ]}
      />

      {/* TODO: Add skeleton */}
      <Suspense fallback={<div>Loading...</div>}>
        <Genres filters={filters} setFilters={setFilters} />
      </Suspense>

      <Button w="100%">Filter</Button>
    </div>
  );
};
export default Filters;
