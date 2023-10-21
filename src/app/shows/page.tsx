import { Container } from "@mantine/core";
import Media from "src/components/Media/Media";
import MoreShows from "src/components/Shows/MoreShows";
import { tmdb } from "src/utils/tmdb";

const ShowsPage = async () => {
  const { results: shows } = await getShows(1);

  return (
    <Container my={40}>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {shows?.map((show) => <Media key={show.id} data={show} />)}
      </div>

      <MoreShows />
    </Container>
  );
};
export default ShowsPage;

const getShows = async (page: number) => {
  const data = await tmdb.discoverTv({ page });

  return data;
};
