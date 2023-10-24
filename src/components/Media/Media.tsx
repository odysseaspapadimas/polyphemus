import type { MovieResult, TvResult } from "moviedb-promise";
import Image from "next/image";
import Link from "next/link";
import MediaMenu from "./MediaMenu";
import slug from "src/utils/slug";
import { getServerAuthSession } from "src/server/auth";
import { IMG_URL } from "src/utils/tmdb";
import { getPlaiceholder } from "plaiceholder";

const isMovie = (data: MovieResult | TvResult): data is MovieResult => {
  return "title" in data;
};

const Media = async ({ data }: { data: MovieResult | TvResult }) => {
  let name, release_date, link;
  // let type = "movie"; not used yet

  if (isMovie(data)) {
    data = data as MovieResult;
    name = data.title;
    release_date = data.release_date?.split("-")[0];
    link = "/movie/" + slug(data.title!) + "-" + data.id;
  } else {
    data = data as TvResult;
    // type = "show";
    name = data.name;
    release_date = data.first_air_date?.split("-")[0];
    link = "/show/" + slug(data.name!) + "-" + data.id;
  }

  const session = await getServerAuthSession();

  let base64;
  if (data.poster_path) {
    const buffer = await fetch(IMG_URL(data.poster_path)).then(async (res) =>
      Buffer.from(await res.arrayBuffer()),
    );

    const res = await getPlaiceholder(buffer);
    base64 = res.base64;
  }

  return (
    <div className="w-[140px] sm:w-[150px]">
      <div className="relative ">
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
          <Image
            alt="movie poster"
            src={IMG_URL(data.poster_path, 300)}
            width={175}
            height={262.5}
            className={`border border-transparent transition-all duration-200 ease-in-out hover:border-sky-300 group-hover:opacity-75`}
            placeholder="blur"
            blurDataURL={base64}
          />
        </Link>
        {session && (
          <MediaMenu
            mediaId={data.id!}
            mediaType={isMovie(data) ? "MOVIE" : "SHOW"}
          />
        )}
      </div>
      <h2 className="whitespace-pre-wrap font-semibold">
        {name} ({release_date})
      </h2>
    </div>
  );
};
export default Media;
