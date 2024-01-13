import type { MovieResult, TvResult } from "moviedb-promise";
import Media from "src/components/Media/Media";
import { Container } from "@mantine/core";
import { tmdb } from "src/lib/tmdb";
import { cache } from "react";

export const revalidate = 60 * 60 * 24;

export default async function Home() {
  const movies = await getMovies();

  const shows = await getShows();

  return (
    <Container size="md" my={36}>
      <main className="">
        <h1 className="mb-2 border-b border-b-gray-600 text-xl font-semibold">
          Trending Movies
        </h1>
        <div className="grid w-full grid-cols-2 justify-items-center gap-y-3 md:grid-cols-5 md:gap-2 md:space-y-0">
          {movies
            .map((movie) => (
              <div key={movie.id}>
                <Media data={movie} />
              </div>
            ))
            .slice(0, 10)}
        </div>
        <h1 className="mb-2 mt-6 border-b border-b-gray-600 text-xl font-semibold">
          Trending TV Shows
        </h1>
        <div className="grid w-full grid-cols-2 justify-items-center gap-y-3 md:grid-cols-5 md:gap-2 md:space-y-0">
          {shows
            .map((show) => (
              <div key={show.id}>
                <Media data={show} />
              </div>
            ))
            .slice(0, 10)}
        </div>
      </main>
    </Container>
  );
}

const getMovies = cache(async () => {
  const trendingMovies = await tmdb.trending({
    media_type: "movie",
    time_window: "day",
  });

  const movies = trendingMovies.results as MovieResult[];
  return movies;
});

const getShows = cache(async () => {
  const trendingShows = await tmdb.trending({
    media_type: "tv",
    time_window: "day",
  });
  const shows = trendingShows.results as TvResult[];

  return shows;
});
