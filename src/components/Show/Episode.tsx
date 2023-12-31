import dayjs from "dayjs";
import type { Episode as EpisodeType } from "moviedb-promise";
import Image from "next/image";
import { IMG_URL } from "src/lib/tmdb";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

type Props = {
  episode: EpisodeType;
  backdrop: string | null | undefined;
  isNext: boolean;
};

const Episode = ({ episode, backdrop, isNext }: Props) => {
  return (
    <div>
      <h2 className="mb-2 text-2xl font-semibold">
        {isNext ? "Next" : "Last"} Episode
      </h2>

      <div className="relative">
        {!episode.still_path && !backdrop ? (
          <div className="h-[281px] w-[500px] bg-slate-700"></div>
        ) : (
          <Image
            src={IMG_URL(episode.still_path ?? backdrop)}
            className="brightness-50"
            alt="episode image"
            width={400}
            height={225}
          />
        )}

        {episode.air_date && (
          <p className="absolute left-4 top-4 z-10 rounded-sm bg-primary px-2 py-1 text-sm">
            {dayjs(episode.air_date).format("DD MMM YYYY hh:mm")} -{" "}
            {dayjs(episode.air_date).fromNow()}
          </p>
        )}

        <p className="absolute bottom-3 left-3 text-lg font-semibold">
          {episode.season_number}x{episode.episode_number} - {episode.name}
        </p>
      </div>
    </div>
  );
};
export default Episode;
