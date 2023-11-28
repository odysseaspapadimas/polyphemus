import { Container } from "@mantine/core";
import type { DiscoverMovieRequest } from "moviedb-promise";
import { Suspense } from "react";
import Filters from "src/components/Discover/Filters";
import InitialSection from "src/components/Discover/InitialSection";
import InitialSectionSkeleton from "src/components/Discover/InitialSectionSkeleton";
import LoadMore from "src/components/Discover/LoadMore";
import MediaSection from "src/components/Discover/MediaSection";

export type MoviesPageProps = {
  searchParams: {
    page: string;
    sort_by?: DiscoverMovieRequest["sort_by"];
    with_genres?: string;
    "vote_average.gte"?: number;
    "vote_average.lte"?: number;
  };
};

const MoviesPage = ({ searchParams }: MoviesPageProps) => {
  const page = parseInt(searchParams.page ?? "1");

  console.log(searchParams, "params");

  return (
    <Container my={36} className="flex flex-col md:flex-row md:space-x-4">
      <div className="mb-4 flex flex-1 flex-col space-y-2">
        <Filters />
        {/* <Filters
          filters={filters}
          setFilters={setFilters}
          genresList={genresList}
          handleSearch={handleSearch}
          type="shows"
        />
        <Button onClick={handleSearch} className="bg-primary">
          Filter
        </Button> */}
      </div>
      <div className="flex-[3]">
        <Suspense fallback={<InitialSectionSkeleton />}>
          <InitialSection type="MOVIE" searchParams={searchParams} />
        </Suspense>

        <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
          {new Array(page)
            .fill(0)
            .map(
              (_, i) =>
                i + 1 > 1 && (
                  <MediaSection
                    key={i}
                    page={i + 1}
                    type="MOVIE"
                    searchParams={searchParams}
                  />
                ),
            )}
        </div>

        <LoadMore />
      </div>
    </Container>
  );
};
export default MoviesPage;
