import { Button, Center, Container } from "@mantine/core";
import Link from "next/link";
import Media from "src/components/Media/Media";
import ShowsSection from "src/components/Shows/ShowsSection";
import { tmdb } from "src/utils/tmdb";

type Props = {
  searchParams: {
    page: string;
  };
};

const ShowsPage = async ({ searchParams }: Props) => {
  const { results: shows } = await getShows(1);

  const page = parseInt(searchParams.page ?? "1");

  console.log(page, "page");
  return (
    <Container my={40}>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {shows?.map((show) => <Media key={show.id} data={show} />)}
      </div>

      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {new Array(page)
          .fill(0)
          .map((_, i) => i + 1 > 1 && <ShowsSection key={i} page={i + 1} />)}
      </div>

      <Center className="py-8">
        <Link href={`shows?page=${page + 1}`} scroll={false}>
          <Button>Load More</Button>
        </Link>
      </Center>
    </Container>
  );
};
export default ShowsPage;

const getShows = async (page: number) => {
  const data = await tmdb.discoverTv({ page });

  return data;
};
