import { MovieDb } from "moviedb-promise";
import type {
  DiscoverMovieRequest,
  DiscoverTvRequest,
  MovieResponse,
  MovieResult,
  ShowResponse,
  TvResult,
} from "moviedb-promise";

if (!process.env.NEXT_PUBLIC_TMDB_API_KEY)
  throw Error("NEXT_PUBLIC_TMDB_API_KEY environment variable is not set");

export const tmdb = new MovieDb(process.env.NEXT_PUBLIC_TMDB_API_KEY);

export const IMG_URL = (path: string | undefined | null, w?: number) =>
  `https://image.tmdb.org/t/p/${w ? "w" + w : "original"}${path}`;

export const isMovie = (data: MovieResult | TvResult): data is MovieResult => {
  return "title" in data;
};

export const isShowResponse = (
  data: MovieResponse | ShowResponse,
): data is ShowResponse => {
  return "name" in data;
};

export const isMovieRequest = (
  filters: (DiscoverMovieRequest | DiscoverTvRequest) & { page?: number },
): filters is DiscoverMovieRequest & { page?: number } => {
  return (
    (filters as DiscoverMovieRequest)["primary_release_date.lte"] !== undefined
  );
};
