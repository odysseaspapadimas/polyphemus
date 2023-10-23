import { api } from "src/trpc/server";
import Media from "../Media/Media";

const MediaSection = async ({
  page,
  type,
}: {
  page: number;
  type: "MOVIE" | "SHOW";
}) => {
  const mediaQuery = await api.media.discover.query({ page, type });

  return (
    <>{mediaQuery?.map((media) => <Media key={media.id} data={media} />)}</>
  );
};
export default MediaSection;
