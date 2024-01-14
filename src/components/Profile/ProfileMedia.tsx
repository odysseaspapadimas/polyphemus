/* eslint-disable @next/next/no-img-element */
import type { MovieResponse, ShowResponse } from "moviedb-promise";
import Link from "next/link";
import slug from "src/lib/slug";
import { IMG_URL } from "src/lib/tmdb";
import MediaMenu from "../Media/MediaMenu";
import type { Session } from "next-auth";
import BlurryImage from "../Media/BlurryImage";

type Props = {
  data: MovieResponse | ShowResponse;
  session: Session | null;
};

const isMovie = (data: MovieResponse | ShowResponse): data is MovieResponse => {
  return "title" in data;
};

const ProfileMedia = ({ data, session }: Props) => {
  let name, release_date, link;
  let type = "movie";

  if (isMovie(data)) {
    name = data.title;
    release_date = data.release_date?.split("-")[0];
    link = "/movie/" + slug(data.title!) + "-" + data.id;
  } else {
    data = data as ShowResponse;
    type = "show";
    name = data.name;
    release_date = data.first_air_date?.split("-")[0];
    link = "/show/" + slug(data.name!) + "-" + data.id;
  }

  return (
    <div className="w-[160px] sm:w-[172.8px] ">
      <div className="relative">
        <div
          className="absolute left-2 top-2 z-10 grid h-[34px] w-[34px] place-items-center rounded-full border-[3px]"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderColor: `hsl(${
              (115 * (data.vote_average ?? 0)) / 10
            }, 100%, 28%)`,
          }}
        >
          <span>{Math.round((data.vote_average ?? 0) * 10) / 10}</span>
        </div>
        <Link href={link}>
          <BlurryImage
            alt={`${type} poster`}
            src={IMG_URL(data.poster_path, 300)}
            width={172.8}
            height={259.2}
            className={`border border-transparent transition-all duration-200 ease-in-out hover:border-sky-300 group-hover:opacity-75`}
          />
        </Link>
        {session && (
          <MediaMenu
            mediaId={data.id!}
            mediaType={isMovie(data) ? "MOVIE" : "SHOW"}
            mediaImage={data.poster_path}
            mediaName={name}
          />
        )}
      </div>
      <h2 className="whitespace-pre-wrap font-semibold">
        {name} ({release_date})
      </h2>
    </div>
  );
};
export default ProfileMedia;
