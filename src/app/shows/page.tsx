import { Container } from "@mantine/core";
import LoadMore from "src/components/Discover/LoadMore";
import MediaSection from "src/components/Discover/MediaSection";
import Media from "src/components/Media/Media";
import { tmdb } from "src/utils/tmdb";

type Props = {
  searchParams: {
    page: string;
  };
};

const ShowsPage = async ({ searchParams }: Props) => {
  const { results: shows } = await tmdb.discoverTv();

  const page = parseInt(searchParams.page ?? "1");

  return (
    <Container my={36}>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {shows?.map((show) => <Media key={show.id} data={show} />)}
      </div>

      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {new Array(page)
          .fill(0)
          .map(
            (_, i) =>
              i + 1 > 1 && <MediaSection key={i} page={i + 1} type="SHOW" />,
          )}
      </div>

      <LoadMore />
    </Container>
  );
};
export default ShowsPage;
