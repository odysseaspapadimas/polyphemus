"use client";

import { Button, RangeSlider, type RangeSliderValue } from "@mantine/core";
import Sort from "./Sort";
import { useEffect, useState } from "react";
import type { DiscoverMovieRequest, DiscoverTvRequest } from "moviedb-promise";
import Genres from "./Genres";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createUrl } from "src/lib/utils";
import { DatePickerInput } from "@mantine/dates";
import dayjs from "dayjs";

const Filters = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const vote_average_gte = parseFloat(
    searchParams.get("vote_average.gte") ?? "0",
  );
  const vote_average_lte = parseFloat(
    searchParams.get("vote_average.lte") ?? "10",
  );

  const with_genres = searchParams.get("with_genres") ?? undefined;

  const sort_by = searchParams.get("sort_by") ?? undefined;

  const [filters, setFilters] = useState<
    DiscoverMovieRequest | DiscoverTvRequest
  >({
    "vote_average.gte": vote_average_gte === 0 ? undefined : vote_average_gte,
    "vote_average.lte": vote_average_lte === 10 ? undefined : vote_average_lte,
    with_genres,
    sort_by,
  });

  const handleVote = (value: RangeSliderValue) => {
    const newFilters = filters;
    newFilters["vote_average.gte"] = value[0] / 10;
    newFilters["vote_average.lte"] = value[1] / 10;

    if (value[0] === 0) {
      delete newFilters["vote_average.gte"];
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("vote_average.gte");
    }
    if (value[1] === 100) {
      delete newFilters["vote_average.lte"];
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("vote_average.lte");
    }

    setFilters(newFilters);
  };

  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(new Date());

  const handleDate = (date: Date | null, label: "from" | "to") => {
    const isMovies = pathname === "/movies";

    const movieFilters = filters as DiscoverMovieRequest;
    const tvFilters = filters as DiscoverTvRequest;

    if (label === "to" && date && fromDate) {
      if (fromDate > date) {
        setFromDate(date);
      }
    }

    if (label === "from") {
      if (!isMovies) {
        if (!date) {
          delete tvFilters["air_date.gte"];
        } else {
          tvFilters["air_date.gte"] = dayjs(date).format("YYYY-MM-DD");
        }
      } else if (isMovies) {
        if (!date) {
          delete movieFilters["primary_release_date.gte"];
        } else {
          movieFilters["primary_release_date.gte"] =
            dayjs(date).format("YYYY-MM-DD");
        }
      }
    } else {
      if (!isMovies) {
        if (!date) {
          delete tvFilters["air_date.lte"];
        } else {
          tvFilters["air_date.lte"] = dayjs(date).format("YYYY-MM-DD");
        }
      } else {
        if (!date) {
          delete movieFilters["primary_release_date.lte"];
        } else {
          movieFilters["primary_release_date.lte"] =
            dayjs(date).format("YYYY-MM-DD");
        }
      }
    }

    if (isMovies) {
      setFilters(movieFilters);
    } else {
      setFilters(tvFilters);
    }
  };

  const [loading, setLoading] = useState(false);

  const handleFilter = () => {
    setLoading(true);
    const newParams = new URLSearchParams();

    Object.keys(filters).forEach((key) => {
      const value =
        filters[key as keyof (DiscoverMovieRequest | DiscoverTvRequest)]; // Use type assertion

      if (value) {
        newParams.set(key, value.toString());
      }
    });

    const url = createUrl(pathname, newParams);
    router.push(url);
  };

  useEffect(() => {
    setLoading(false);
  }, [searchParams]);

  return (
    <div>
      <Sort filters={filters} setFilters={setFilters} />
      <h2>Rating</h2>
      <RangeSlider
        mb={32}
        onChangeEnd={handleVote}
        defaultValue={[vote_average_gte * 10, vote_average_lte * 10]}
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

      <div>
        <h2>Release Date</h2>
        <DatePickerInput
          value={fromDate}
          onChange={(e) => {
            handleDate(e, "from");
            setFromDate(e);
          }}
          maxDate={toDate ? toDate : undefined}
          placeholder="Pick date"
          valueFormat="MM/DD/YYYY"
          label="From"
        />
        <DatePickerInput
          value={toDate}
          onChange={(e) => {
            handleDate(e, "to");
            if (e) {
              setToDate(e);
            }
          }}
          placeholder="Pick date"
          valueFormat="MM/DD/YYYY"
          label="To"
          defaultValue={new Date()}
        />
      </div>

      <Genres filters={filters} setFilters={setFilters} />

      <Button loading={loading} onClick={handleFilter} w="100%">
        Filter
      </Button>
    </div>
  );
};
export default Filters;
