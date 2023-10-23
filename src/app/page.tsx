import { tmdb } from "src/utils/tmdb";
import type { MovieResult, TvResult } from "moviedb-promise";
import Media from "src/components/Media/Media";
import { Container } from "@mantine/core";

export default async function Home() {
  const trendingMovies = await tmdb.trending({
    media_type: "movie",
    time_window: "day",
  });

  const movies = trendingMovies.results as MovieResult[];

  const trendingShows = await tmdb.trending({
    media_type: "tv",
    time_window: "day",
  });
  const shows = trendingShows.results as TvResult[];

  return (
    <Container size="md" my={36}>
      <main className="">
        <h1 className="text-xl font-semibold border-b border-b-gray-600 mb-2">
          Trending Movies
        </h1>
        <div className="grid justify-items-center gap-y-3 md:space-y-0 w-full grid-cols-2 md:grid-cols-6 md:gap-2">
          {movies
            .map((movie) => (
              <div key={movie.id}>
                <Media data={movie} />
              </div>
            ))
            .slice(0, 12)}
        </div>
        <h1 className="mt-6 text-xl font-semibold border-b border-b-gray-600 mb-2">
          Trending TV Shows
        </h1>
        <div className="grid justify-items-center gap-y-3 md:space-y-0 w-full grid-cols-2 md:grid-cols-6 md:gap-2">
          {shows
            .map((show) => (
              <div key={show.id}>
                <Media data={show} />
              </div>
            ))
            .slice(0, 12)}
        </div>
      </main>
    </Container>
  );
}
