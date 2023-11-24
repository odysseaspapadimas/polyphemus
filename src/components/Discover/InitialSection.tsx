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
    const params = searchParams as MoviesPageProps["searchParams"];
    const requestParams: DiscoverMovieRequest = {
      sort_by: params.sort_by ?? "popularity.desc",
    };

    const { results: movies } = await tmdb.discoverMovie(requestParams);

    return (
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {movies?.map((movie) => <Media key={movie.id} data={movie} />)}
      </div>
    );
  } else if (type === "SHOW") {
    const { results: shows } = await tmdb.discoverTv();

    return (
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {shows?.map((show) => <Media key={show.id} data={show} />)}
      </div>
    );
  }
};
export default InitialSection;
