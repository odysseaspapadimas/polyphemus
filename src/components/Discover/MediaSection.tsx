import Media from "../Media/Media";
import type { MoviesPageProps } from "src/app/movies/page";
import type { ShowsPageProps } from "src/app/shows/page";
import type { DiscoverMovieRequest, DiscoverTvRequest } from "moviedb-promise";
import { tmdb } from "src/lib/tmdb";

const MediaSection = async ({
  page,
  type,
  searchParams,
}: {
  page: number;
  type: "MOVIE" | "SHOW";
  searchParams:
    | MoviesPageProps["searchParams"]
    | ShowsPageProps["searchParams"];
}) => {
  if (type === "MOVIE") {
    //eslint-disable-next-line
    const { page: _, ...params } =
      searchParams as MoviesPageProps["searchParams"];
    const requestParams: DiscoverMovieRequest = {
      page,
      ...params,
    };

    const { results: movies } = await tmdb.discoverMovie(requestParams);

    return <>{movies?.map((media) => <Media key={media.id} data={media} />)}</>;
  } else if (type === "SHOW") {
    //eslint-disable-next-line
    const { page: _, ...params } =
      searchParams as ShowsPageProps["searchParams"];
    const requestParams: DiscoverTvRequest = {
      page,
      ...params,
    };

    const { results: shows } = await tmdb.discoverTv(requestParams);

    return <>{shows?.map((media) => <Media key={media.id} data={media} />)}</>;
  }
};
export default MediaSection;
