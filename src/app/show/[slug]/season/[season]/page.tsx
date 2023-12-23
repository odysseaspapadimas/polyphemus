import { Container } from "@mantine/core";
import { redirect } from "next/navigation";
import { IMG_URL, tmdb } from "src/lib/tmdb";
import { getAverageColor } from "fast-average-color-node";
import Image from "next/image";
import Link from "next/link";
import { IconArrowLeft, IconStar } from "@tabler/icons-react";
import dayjs from "dayjs";

type Props = {
  params: {
    slug: string;
    season: string;
  };
};

const Season = async ({ params }: Props) => {
  const { show, season } = await getShowInfo(
    params.slug,
    Number(params.season),
  );

  let bgColor = "";
  if (season.poster_path) {
    const color = await getAverageColor(IMG_URL(season.poster_path));
    bgColor = color.hex;
  }

  return (
    <>
      <header
        className={`${!bgColor && "bg-primary"}`}
        style={{ backgroundColor: bgColor }}
      >
        <Container className="flex items-center space-x-4 py-4">
          {season.poster_path && (
            <Image
              src={IMG_URL(season.poster_path)}
              alt="season poster path"
              width={100}
              height={150}
              className="rounded-md"
            />
          )}
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {season.name}{" "}
              <span className="font-normal text-gray-300">
                ({season.air_date?.split("-")[0]})
              </span>
            </h1>
            <Link href={`/show/${params.slug}/seasons`}>
              <div className="flex items-center space-x-2 text-gray-200 hover:text-gray-300">
                <IconArrowLeft className="" />
                <span className="text-sm ">Go back to seasons lists</span>
              </div>
            </Link>
          </div>
        </Container>
      </header>
      <Container className="mt-4">
        <h2 className="mb-2 text-xl font-semibold">
          Episodes{" "}
          <span className="font-normal text-gray-300">
            {season.episodes?.length}
          </span>{" "}
        </h2>

        <div className="flex flex-col space-y-8 pb-4">
          {season.episodes?.map((episode) => (
            <div
              key={episode.id}
              className="flex flex-col items-center md:flex-row md:space-x-4"
            >
              {episode.still_path ? (
                <img
                  src={IMG_URL(episode.still_path)}
                  alt="episode image"
                  className="md:h-[117px] md:w-[217px] md:rounded-l-md"
                />
              ) : (
                <div className="bg-dark md:h-[117px] md:w-[217px] md:rounded-l-md"></div>
              )}
              <div className="flex-1">
                <div className="flex w-full flex-col md:flex-row md:items-start">
                  <div className="order-2 flex items-center space-x-3 md:order-1">
                    <span className="font-semibold">
                      {episode.episode_number}
                    </span>
                    {episode.vote_count &&
                    episode.vote_count > 0 &&
                    episode.vote_average &&
                    episode.vote_average > 0 ? (
                      <div
                        className="flex items-center space-x-1 rounded-md px-2 py-1"
                        style={{
                          backgroundColor: `hsl(${
                            (85 * episode.vote_average) / 10
                          }, 100%, 28%)`,
                        }}
                      >
                        <IconStar size={20} />
                        <span>
                          {Math.round(episode.vote_average * 10) / 10}
                        </span>
                      </div>
                    ) : (
                      <></>
                    )}
                    <h3 className="break-words font-semibold">
                      {episode.name}
                    </h3>
                  </div>

                  <div className="order-1 flex flex-col self-end break-all text-right text-sm text-gray-300 md:order-2 md:ml-auto">
                    <span>
                      {dayjs(episode.air_date).format("MMM DD, YYYY")}
                    </span>
                    {show.episode_run_time &&
                      show.episode_run_time.length > 0 && (
                        <span>{show.episode_run_time}m</span>
                      )}
                  </div>
                </div>

                <p className="mt-3 text-sm">
                  {episode.overview || "No episode overview available yet."}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
};

export default Season;

const getShowInfo = async (slug: string, season_number: number) => {
  const id = slug.split("-").pop()!;

  const showData = await tmdb.tvInfo({
    id,
    append_to_response: "aggregate_credits,",
  });

  const season = await tmdb.seasonInfo({ id, season_number });

  const showName = showData.name?.toLowerCase().replace(/[\W_]+/g, "-");

  if (!slug.split("-").slice(1).join("-")) {
    redirect(`/show/${showName}-${id}/season/${season_number}`);
  }

  return {
    show: showData,
    season,
  };
};
