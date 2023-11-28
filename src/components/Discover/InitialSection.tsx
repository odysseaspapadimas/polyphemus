import { tmdb } from "src/lib/tmdb";
import Media from "../Media/Media";
import type { MediaType } from "@prisma/client";
import type { MoviesPageProps } from "src/app/movies/page";
import type { DiscoverMovieRequest } from "moviedb-promise";
import type { ShowsPageProps } from "src/app/shows/page";

type Props = {
  type: MediaType;
  searchParams:
    | MoviesPageProps["searchParams"]
    | ShowsPageProps["searchParams"];
};

const InitialSection = async ({ type, searchParams }: Props) => {
  if (type === "MOVIE") {
    //eslint-disable-next-line
    const { page, ...params } = searchParams as MoviesPageProps["searchParams"];
    const requestParams: DiscoverMovieRequest = {
      ...params,
    };

    const { results: movies } = await tmdb.discoverMovie(requestParams);

    return (
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {movies?.map((movie) => <Media key={movie.id} data={movie} />)}
      </div>
    );
  } else if (type === "SHOW") {
    //eslint-disable-next-line
    const { page, ...params } = searchParams as ShowsPageProps["searchParams"];
    const { results: shows } = await tmdb.discoverTv({
      ...params,
    });

    return (
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {shows?.map((show) => <Media key={show.id} data={show} />)}
      </div>
    );
  }
};
export default InitialSection;
