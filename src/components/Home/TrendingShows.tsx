import { Group } from "@mantine/core";
import Link from "next/link";
import { TVShowType } from "src/constants/types";
import Media from "../Media";

const TrendingShows = ({ shows }: { shows: TVShowType[] }) => {

  return (
    <div>
      <Group position="apart" className="border-b border-gray-600 mb-3">
        <h2 className="font-semibold text-lg">Trending TV Shows</h2>
        <Link
          href="shows"
          className="text-gray-300 text-sm hover:text-primary"
        >
          See more
        </Link>
      </Group>

      <div className="grid justify-items-center gap-y-3 md:space-y-0 w-full grid-cols-2 md:grid-cols-6 md:gap-2">
        {shows
          .map((data: TVShowType) => <Media key={data.id} data={data} />)
          .slice(0, 6)}
      </div>
    </div>
  );
};
export default TrendingShows;
