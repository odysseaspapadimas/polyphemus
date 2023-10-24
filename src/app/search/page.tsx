import { Container, Group } from "@mantine/core";
import Media from "src/components/Media/Media";
import Pagination from "src/components/Search/Pagination";
import { tmdb } from "src/utils/tmdb";

type Props = {
  searchParams: {
    q: string;
    page: string;
  };
};

const SearchPage = async ({ searchParams }: Props) => {
  const { q: query } = searchParams;
  const page = parseInt(searchParams.page ?? "1");
  const { results, total_results, total_pages } = await tmdb.searchMulti({
    query,
    page,
  });

  return (
    <Container py={36}>
      <h2 className="mb-6 text-xl">
        Found {total_results} results for &quot;{query}&quot;
      </h2>

      <Pagination page={page} total_pages={total_pages ?? 1} />

      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {results?.map(
          (result) =>
            result.media_type !== "person" && (
              <div key={result.id}>
                <p>{result.id}</p>
              </div>
            ),
        )}
      </div>
    </Container>
  );
};
export default SearchPage;
