import { IconX } from "@tabler/icons-react";
import type { MovieResult, TvResult } from "moviedb-promise";
import Image from "next/image";
import React from "react";
import { IMG_URL, isMovie } from "src/lib/tmdb";

type Props = {
  media: MovieResult | TvResult;
  handleRemoveSelected: () => void;
};

const SelectedMedia = ({ media, handleRemoveSelected }: Props) => {
  const name = isMovie(media) ? media.title : media.name;

  const released = (
    isMovie(media) ? media.release_date : media.first_air_date
  )?.split("-")[0];

  return (
    <div className="flex w-full cursor-pointer items-center space-x-2 rounded-md bg-primary p-2">
      {media.poster_path ? (
        <Image
          src={IMG_URL(media.poster_path)}
          alt="poster"
          width={50}
          height={75}
          className="rounded-bl-lg rounded-tl-lg"
        />
      ) : (
        <div className="grid h-[75px] w-[50px] place-items-center bg-slate-800"></div>
      )}

      <p className="text-sm">
        {name} ({released})
      </p>

      <div className="flex-1 pr-2">
        <IconX
          onClick={handleRemoveSelected}
          className="ml-auto hover:text-red-500"
          size={18}
        />
      </div>
    </div>
  );
};

export default SelectedMedia;
