import { Container } from "@mantine/core";
import { DiscoverTvRequest } from "moviedb-promise";
import { Suspense } from "react";
import InitialSection from "src/components/Discover/InitialSection";
import InitialSectionSkeleton from "src/components/Discover/InitialSectionSkeleton";
import LoadMore from "src/components/Discover/LoadMore";
import MediaSection from "src/components/Discover/MediaSection";

export type ShowsPageProps = {
  searchParams: {
    page: string;
    sort_by: DiscoverTvRequest["sort_by"];
  };
};

const ShowsPage = ({ searchParams }: ShowsPageProps) => {
  const page = parseInt(searchParams.page ?? "1");

  return (
    <Container my={36}>
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
    </Container>
  );
};
export default ShowsPage;
