"use client";

import { Popover, RingProgress, Text } from "@mantine/core";
import type { MovieResponse } from "moviedb-promise";

type Props = {
  vote_average?: number;
  vote_count?: number;
  media: MovieResponse;
};
const RatingRing = ({ vote_average = 0, vote_count = 0, media }: Props) => {
  return (
    <Popover position="bottom-start" withArrow arrowPosition="center">
      <Popover.Target>
        <RingProgress
          sections={[
            {
              value: vote_average * 10,
              color: `hsl(${(115 * vote_average) / 10}, 100%, 28%)`,
            },
          ]}
          size={100}
          className="my-4 cursor-pointer rounded-full bg-black bg-opacity-50 transition-transform duration-200 hover:scale-110 sm:my-0"
          label={
            <Text fw={700} ta="center" size="lg">
              {Math.round(vote_average * 10)}
              <span className="text-sm">%</span>
            </Text>
          }
        />
      </Popover.Target>

      <Popover.Dropdown>
        <div>
          <Text size="lg" fw="bold">
            Rating Breakdown
          </Text>

          <p>
            TMDB: {new Intl.NumberFormat("en-IN").format(vote_count)}{" "}
            {vote_count === 1 ? "rating" : "ratings"}
          </p>
          <p>
            Polyphemus:{" "}
            {new Intl.NumberFormat("en-IN").format(media?.vote_count ?? 0)}{" "}
            {media?.vote_count === 1 ? "rating" : "ratings"}
          </p>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
};
export default RatingRing;
