import { Container } from "@mantine/core";
import type { DiscoverTvRequest } from "moviedb-promise";
import { Suspense } from "react";
import Filters from "src/components/Discover/Filters";
import InitialSection from "src/components/Discover/InitialSection";
import InitialSectionSkeleton from "src/components/Discover/InitialSectionSkeleton";
import LoadMore from "src/components/Discover/LoadMore";
import MediaSection from "src/components/Discover/MediaSection";

export type ShowsPageProps = {
  searchParams: {
    page: string;
    sort_by?: DiscoverTvRequest["sort_by"];
    with_genres?: string;
    "vote_average.gte"?: number;
    "vote_average.lte"?: number;
  };
};

const ShowsPage = ({ searchParams }: ShowsPageProps) => {
  const page = parseInt(searchParams.page ?? "1");

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
          <InitialSection type="SHOW" searchParams={searchParams} />
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
                    type="SHOW"
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
export default ShowsPage;
