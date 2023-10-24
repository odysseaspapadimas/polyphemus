import type { MovieResult, TvResult } from "moviedb-promise";
import Image from "next/image";
import { getPlaiceholder } from "plaiceholder";
import slug from "src/utils/slug";
import { IMG_URL } from "src/utils/tmdb";
import MediaInfo from "./MediaInfo";
import Link from "next/link";
import { IconPhotoOff } from "@tabler/icons-react";

const isMovie = (data: MovieResult | TvResult): data is MovieResult => {
  return "title" in data;
};

const MediaResult = async ({ data }: { data: MovieResult | TvResult }) => {
  let name, release_date, link;
  // let type = "movie"; not used yet

  if (isMovie(data)) {
    data = data as MovieResult;
    name = data.title;
    release_date = data.release_date;
    link = "/movie/" + slug(data.title!) + "-" + data.id;
  } else {
    data = data as TvResult;
    // type = "show";
    name = data.name;
    release_date = data.first_air_date;
    link = "/show/" + slug(data.name!) + "-" + data.id;
  }

  let base64;
  if (data.poster_path) {
    const buffer = await fetch(IMG_URL(data.poster_path, 300)).then(
      async (res) => Buffer.from(await res.arrayBuffer()),
    );

    const res = await getPlaiceholder(buffer);
    base64 = res.base64;
  }
  return (
    <div className="flex items-center rounded-md border border-gray-500 sm:items-start">
      <Link href={link}>
        {data.poster_path ? (
          <Image
            src={IMG_URL(data.poster_path, 200)}
            alt="poster"
            width={125}
            height={187.5}
            className="rounded-bl-md rounded-tl-md"
            placeholder="blur"
            blurDataURL={base64}
          />
        ) : (
          <div className="grid h-[187.5px] w-[125px] place-items-center rounded-bl-md rounded-tl-md bg-slate-500">
            <IconPhotoOff />
          </div>
        )}
      </Link>

      <MediaInfo
        name={name}
        release_date={release_date}
        overview={data.overview}
        link={link}
      />
    </div>
  );
};
export default MediaResult;
