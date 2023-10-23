import { Container } from "@mantine/core";
import LoadMore from "src/components/Discover/LoadMore";
import MediaSection from "src/components/Discover/MediaSection";
import Media from "src/components/Media/Media";
import { api } from "src/trpc/server";

type Props = {
  searchParams: {
    page: string;
  };
};

const MoviesPage = async ({ searchParams }: Props) => {
  const movies = await api.media.discover.query({ page: 1, type: "MOVIE" });

  const page = parseInt(searchParams.page ?? "1");

  return (
    <Container my={36}>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {movies?.map((movie) => <Media key={movie.id} data={movie} />)}
      </div>

      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {new Array(page)
          .fill(0)
          .map(
            (_, i) =>
              i + 1 > 1 && <MediaSection key={i} page={i + 1} type="MOVIE" />,
          )}
      </div>

      <LoadMore />
    </Container>
  );
};
export default MoviesPage;
