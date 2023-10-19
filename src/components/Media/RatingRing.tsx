"use client";

import { Popover, RingProgress, Text } from "@mantine/core";

type Props = {
  vote_average?: number;
  vote_count?: number;
  media: any;
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
          className="rounded-full bg-black bg-opacity-50 my-4 sm:my-0 cursor-pointer hover:scale-110 transition-transform duration-200"
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
            Polyphemus: {new Intl.NumberFormat("en-IN").format(media?.vote_count)}{" "}
            {media?.vote_count === 1 ? "rating" : "ratings"}
          </p>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
};
export default RatingRing;
