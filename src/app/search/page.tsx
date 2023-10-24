import { Container } from "@mantine/core";
import MediaResult from "src/components/Search/MediaResult";
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

      <div className="my-9 flex flex-col space-y-4">
        {results?.map(
          (result) =>
            result.media_type !== "person" && (
              <MediaResult key={result.id} data={result} />
            ),
        )}
      </div>

      <Pagination page={page} total_pages={total_pages ?? 1} />
    </Container>
  );
};
export default SearchPage;
