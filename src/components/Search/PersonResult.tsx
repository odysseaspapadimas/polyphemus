import { IconPhotoOff } from "@tabler/icons-react";
import type {
  MovieResult,
  PersonResult as PersonResultType,
  TvResult,
} from "moviedb-promise";
import Image from "next/image";
import Link from "next/link";
import { getPlaiceholder } from "plaiceholder";
import slug from "src/lib/slug";
import { IMG_URL } from "src/lib/tmdb";

const PersonResult = async ({
  data,
}: {
  data: PersonResultType & { known_for_department?: string };
}) => {
  let base64;
  if (data.profile_path) {
    const buffer = await fetch(IMG_URL(data.profile_path, 300)).then(
      async (res) => Buffer.from(await res.arrayBuffer()),
    );

    const res = await getPlaiceholder(buffer);
    base64 = res.base64;
  }

  const link = "/person/" + slug(data.name!) + "-" + data.id;

  return (
    <div className="flex items-center rounded-md border border-gray-500 sm:items-start">
      <Link href={link}>
        {data.profile_path ? (
          <Image
            src={IMG_URL(data.profile_path, 200)}
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

      <div className="flex-[2] p-3">
        <Link href={link} className="text-lg font-semibold hover:text-primary">
          <h2>{data.name}</h2>
        </Link>
        <p className="font-medium">{data.known_for_department}</p>
        <span
          className="overflow-hidden text-ellipsis"
          style={{ WebkitLineClamp: 1, display: "-webkit-box" }}
        >
          {data.known_for
            ? data.known_for.map((show: MovieResult | TvResult, i) => {
                let title;
                if (show.media_type === "movie") {
                  title = show.title;
                } else {
                  title = show.name;
                }
                return (
                  <p key={show.id}>
                    {title}
                    {i <
                      (data.known_for !== undefined
                        ? data.known_for.length - 1
                        : 0) && <>,&nbsp;</>}
                  </p>
                );
              })
            : null}
        </span>
      </div>
    </div>
  );
};
export default PersonResult;
