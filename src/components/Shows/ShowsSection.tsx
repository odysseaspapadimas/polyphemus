import { api } from "src/trpc/server";
import Media from "../Media/Media";

const ShowsSection = async ({ page }: { page: number }) => {
  const showsQuery = await api.shows.discover.query({ page });
  console.log(page, 'pagesections num')

  return <>{showsQuery?.map((show) => <Media key={show.id} data={show} />)}</>;
};
export default ShowsSection;
