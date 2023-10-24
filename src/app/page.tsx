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
        <h1 className="mb-2 border-b border-b-gray-600 text-xl font-semibold">
          Trending Movies
        </h1>
        <div className="grid w-full grid-cols-2 justify-items-center gap-y-3 md:grid-cols-6 md:gap-2 md:space-y-0">
          {movies
            .map((movie) => (
              <div key={movie.id}>
                <Media data={movie} />
              </div>
            ))
            .slice(0, 12)}
        </div>
        <h1 className="mb-2 mt-6 border-b border-b-gray-600 text-xl font-semibold">
          Trending TV Shows
        </h1>
        <div className="grid w-full grid-cols-2 justify-items-center gap-y-3 md:grid-cols-6 md:gap-2 md:space-y-0">
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
