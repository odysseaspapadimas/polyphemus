import type { MovieResult, TvResult } from "moviedb-promise";
import Image from "next/image";
import React from "react";
import { IMG_URL, isMovie } from "src/lib/tmdb";

const MediaResult = ({
  onClick,
  result,
}: {
  onClick: (result: MovieResult | TvResult) => void;
  result: MovieResult | TvResult;
}) => {
  const name = isMovie(result) ? result.title : result.name;

  const released = (
    isMovie(result) ? result.release_date : result.first_air_date
  )?.split("-")[0];

  return (
    <div
      onClick={() => onClick(result)}
      className="flex cursor-pointer items-center space-x-2 rounded-md p-2 hover:bg-primary"
    >
      {result.poster_path ? (
        <Image
          src={IMG_URL(result.poster_path)}
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
    </div>
  );
};

export default MediaResult;
