import { api } from "src/trpc/react";
import Media from "../Media/Media";

const ShowsSection = ({ page }: { page: number }) => {
  const showsQuery = api.shows.discover.useQuery(
    { page },
    { enabled: page > 1 },
  );
  return (
    <>
      {showsQuery.data?.map((show) => <Media key={show.id} data={show} />)}
    </>
  );
};
export default ShowsSection;
