import { Button, Center, Container } from "@mantine/core";
import Link from "next/link";
import MediaSection from "src/components/Discover/MediaSection";
import Media from "src/components/Media/Media";
import { api } from "src/trpc/server";

type Props = {
  searchParams: {
    page: string;
  };
};

const ShowsPage = async ({ searchParams }: Props) => {
  const shows = await api.media.discover.query({ page: 1, type: "SHOW" });

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
          .map(
            (_, i) =>
              i + 1 > 1 && <MediaSection key={i} page={i + 1} type="SHOW" />,
          )}
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
