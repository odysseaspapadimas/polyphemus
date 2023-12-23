import { Container } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import dayjs from "dayjs";
import { getAverageColor } from "fast-average-color-node";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IMG_URL, tmdb } from "src/lib/tmdb";

type Props = {
  params: {
    slug: string;
  };
};

const Seasons = async ({ params }: Props) => {
  const { show } = await getShowInfo(params.slug);

  const color = await getAverageColor(IMG_URL(show.poster_path));
  const bgColor = color.hex;

  return (
    <div>
      <header
        className={`${!bgColor && "bg-primary"}`}
        style={{ backgroundColor: bgColor }}
      >
        <Container className="flex items-center space-x-4 py-4">
          {show.poster_path && (
            <Image
              src={IMG_URL(show.poster_path)}
              alt="season poster path"
              width={75}
              height={125}
              className="rounded-md"
            />
          )}
          <div>
            <h1 className="className='font-semibold text-2xl sm:text-3xl">
              {show.name}{" "}
              <span className="font-normal">
                ({show.first_air_date?.split("-")[0]}-
                {show.status === "Ended" && show.last_air_date
                  ? show.last_air_date.split("-")[0]
                  : null}
                )
              </span>
            </h1>
            <Link href={`/show/${params.slug}`}>
              <div className="flex items-center space-x-2 text-gray-200 hover:text-gray-300">
                <IconArrowLeft className="" />
                <span className="text-sm ">Go back to show</span>
              </div>
            </Link>
          </div>
        </Container>
      </header>
      <Container my={16}>
        <div className="flex flex-col space-y-8">
          {show.seasons?.map((season) => (
            <div key={season.id} className="flex items-start space-x-4">
              <Link
                href={`/show/${params.slug}/season/${season.season_number}`}
              >
                <div style={{ width: 125, height: 175 }}>
                  {season.poster_path ? (
                    <Image
                      src={IMG_URL(season.poster_path)}
                      alt="season poster path"
                      width={125}
                      height={175}
                      className="rounded-l-md"
                    />
                  ) : (
                    <div className="bg-dark h-[175px] w-[125px] rounded-l-md"></div>
                  )}
                </div>
              </Link>
              <div className="flex flex-col flex-wrap">
                <div className="flex flex-wrap items-end">
                  <Link
                    href={`/show/${params.slug}/season/${season.season_number}`}
                  >
                    <h2 className="mr-2 text-2xl font-semibold hover:text-gray-300">
                      {season.name}
                    </h2>
                  </Link>

                  <h4 className="font-semibold">
                    {season?.air_date?.split("-")[0]} |{""}{" "}
                    {season.episode_count} Episodes
                  </h4>
                </div>
                <div>
                  <p className="mb-4 mt-2 text-gray-200">
                    {season.air_date ? (
                      <>
                        Season {season.season_number} of {show.name} premiered
                        on {dayjs(season.air_date).format("MMM DD, YYYY")}
                      </>
                    ) : (
                      <>No airdate for Season {season.season_number}</>
                    )}
                  </p>
                  <span className="whitespace-pre-wrap text-sm sm:text-base">
                    {season.overview?.split("\n").map((text, i) => (
                      <p key={i} className="mb-2">
                        {text}
                      </p>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
};
export default Seasons;

const getShowInfo = async (slug: string) => {
  const id = slug.split("-").pop()!;

  const showData = await tmdb.tvInfo({
    id,
  });

  //const season = await tmdb.seasonInfo({ id: showId, season_number })

  const showName = showData.name?.toLowerCase().replace(/[\W_]+/g, "-");

  if (!slug.split("-").slice(1).join("-")) {
    redirect(`/show/${showName}-${id}/seasons`);
  }

  return {
    show: showData,
  };
};
