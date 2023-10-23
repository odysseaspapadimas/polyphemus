import { IMG_URL, tmdb } from "src/utils/tmdb";

import { Container, Text } from "@mantine/core";
import type { Genre } from "moviedb-promise";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import slug from "src/utils/slug";
import type { Metadata } from "next";
import { api } from "src/trpc/server";
import RatingRing from "src/components/Media/RatingRing";
import UserActions from "src/components/MediaPage/UserActions/UserActions";
import { trakt } from "src/utils/trakt";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
import Airs from "src/components/Show/Airs";
import { getPlaiceholder } from "plaiceholder";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

type Props = {
  params: {
    slug: string;
  };
};

const dayNameToNumber: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const show = await getShowInfo(params.slug);
  return {
    title: show.name,
  };
}

const ShowPage = async ({ params }: Props) => {
  const show = await getShowInfo(params.slug);

  if (!params.slug.split("-").slice(1).join("-")) {
    redirect(`/show/${slug(show.name)}-${show.id}`);
  }

  const status = await getInitialStatus(show.id!);

  const airTime = await getAirTime(params.slug);

  const buffer = await fetch(IMG_URL(show.poster_path)).then(async (res) =>
    Buffer.from(await res.arrayBuffer()),
  );

  const { base64 } = await getPlaiceholder(buffer);

  return (
    <div className="relative">
      <div className="absolute left-0 top-0 h-full w-full brightness-[0.25] md:h-screen-header">
        <Image
          src={IMG_URL(show.backdrop_path)}
          priority
          alt="show backdrop"
          className="h-full w-full object-cover"
          fill
          sizes="100vw"
        />
      </div>
      <Container className="relative h-full py-10 sm:flex sm:py-20">
        <div className="flex flex-col items-center justify-center">
          <Image
            height={450}
            width={300}
            alt="show poster"
            src={IMG_URL(show.poster_path, 300)}
            placeholder="blur"
            blurDataURL={base64}
          />

          {/* {session && <FriendActivity type={type} id={showId} />} */}
        </div>
        <div className="mt-4 flex flex-1 flex-col sm:ml-8 sm:mt-0 sm:max-w-2xl">
          <div className="flex">
            <p className="text-3xl font-semibold">
              {show.name}{" "}
              <span className="text-2xl">
                ({show.first_air_date?.split("-")[0]}-
                {show.status === "Ended" && show.last_air_date
                  ? show.last_air_date.split("-")[0]
                  : null}
                )
              </span>
            </p>
          </div>

          <div>
            {show.genres?.map((genre: Genre, i: number) => (
              <React.Fragment key={i}>
                <Link
                  href={`/shows?genres=${genre.name
                    ?.split(" ")[0]
                    ?.toLowerCase()}`}
                  className="hover:underline "
                >
                  {genre.name}
                </Link>
                {i < (show.genres ? show.genres.length - 1 : 0) && ", "}
              </React.Fragment>
            ))}{" "}
            {show.episode_run_time && show.episode_run_time.length > 0 && (
              <>&bull; {show.episode_run_time}m</>
            )}
          </div>
          {/*@ts-expect-error package ts error */}
          {show.next_episode_to_air?.air_date && show.status !== "Ended" && (
            <Airs
              //@ts-expect-error package ts error
              nextEpisodeAirDate={show.next_episode_to_air?.air_date as string}
              airTime={airTime}
            />
          )}

          <div className="flex flex-col items-center sm:my-4 sm:flex-row">
            <RatingRing
              vote_average={show.vote_average}
              vote_count={show.vote_count}
              media={show}
            />

            {status !== undefined && (
              <UserActions
                mediaId={show.id!}
                mediaType="SHOW"
                status={status}
              />
            )}
          </div>

          {/* <div className="flex items-center flex-col sm:flex-row sm:py-4">
            <RatingRing
              vote_average={show.vote_average}
              vote_count={show.vote_count}
              media={mediaData}
            />

            {user && (
              <div className="flex flex-col space-y-4 sm:ml-8">
                <div className="flex justify-around items-center space-x-8">
                  <AlreadyWatched onList={onList} handler={handleWatched} />
                  <PlanToWatch onList={onList} handler={handlePlan} />
                  <Favorite onList={onList} handler={handleFavorite} />
                  <Rate
                    id={showId}
                    type={type}
                    onList={onList}
                    ratings={user.ratings}
                    username={user.username}
                    image_url={user.image_url}
                    mutate={mutateOnList}
                  />
                </div>
                <Recommend
                  user={user.username}
                  users={user.messages}
                  show={show}
                />
              </div>
            )}
          </div> */}

          <div>
            <p className="my-2 text-2xl font-medium">Overview</p>
            <Text>
              {show.overview ? show.overview : "There's no available overview."}
            </Text>
          </div>

          <div className="mt-4">
            <p>
              <span className="font-medium">Seasons: </span>
              {show.number_of_seasons} &bull;{" "}
              <span className="font-medium">Episodes:</span>{" "}
              {show.number_of_episodes}
            </p>
          </div>

          {show.status !== "Ended" && show.last_episode_to_air && (
            <div>
              <p>
                <span className="font-medium">Currently:</span>{" "}
                {show.last_episode_to_air.season_number}x
                {show.last_episode_to_air.episode_number}
              </p>
            </div>
          )}

          {show.created_by && show.created_by.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold">Created by: </p>
              <div className="">
                {show.created_by.map((creator, i) => (
                  <span key={creator.credit_id}>
                    {creator.name}
                    {i < (show.created_by ? show.created_by.length - 1 : 0) &&
                      ", "}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
};
export default ShowPage;

const getShowInfo = async (slug: string) => {
  const id = slug.split("-").pop()!;

  const show = await tmdb.tvInfo({ id: id });
  return show;
};

const getInitialStatus = async (id: number) => {
  try {
    const { status } = (await api.list.getEntry.query({
      mediaId: id,
      mediaType: "SHOW",
    })) ?? { status: null };

    return status;
  } catch (error) {
    return undefined;
  }
};

const getAirTime = async (slug: string) => {
  const name = slug.split("-").slice(0, -1).join("-");
  console.log(name, "name");
  const { data: show } = await trakt.shows.summary({ showId: name });

  if (show?.airs) {
    return show?.airs;
  }
};

//eslint-disable-next-line
const getAirDates = (
  airTime: { day: string; time: string; timezone: string } | undefined,
  next_episode_air_date: string,
  last_episode_air_date: string,
) => {
  let nextAirDate: Date | undefined;
  let lastAirDate: Date | undefined;

  if (airTime && next_episode_air_date) {
    const localTimeZone = dayjs.tz.guess(); // Get the local timezone
    const sourceTime = dayjs.tz(airTime.time, "HH:mm", airTime.timezone);

    // Find the number corresponding to the provided day of the week
    const dayNumber = dayNameToNumber[airTime.day]!;

    // Parse the next episode air date in the source timezone
    const sourceDate = dayjs.tz(next_episode_air_date, airTime.timezone);

    // Calculate the difference in days to the provided day of the week
    const daysUntilTargetDay = (dayNumber - sourceDate.day() + 7) % 7;

    // Calculate the target date
    const targetDate = sourceDate.add(daysUntilTargetDay, "day");

    // Combine the target date and time, explicitly specifying your local timezone
    const combinedDateTime = dayjs
      .tz(
        targetDate.format("YYYY-MM-DD") + " " + sourceTime.format("HH:mm"),
        airTime.timezone,
      )
      .tz(localTimeZone);

    nextAirDate = combinedDateTime.toDate();
  }

  if (airTime && last_episode_air_date) {
    const localTimeZone = dayjs.tz.guess(); // Get the local timezone
    const sourceTime = dayjs.tz(airTime.time, "HH:mm", airTime.timezone);

    // Find the number corresponding to the provided day of the week
    const dayNumber = dayNameToNumber[airTime.day]!;

    // Parse the next episode air date in the source timezone
    const sourceDate = dayjs.tz(last_episode_air_date, airTime.timezone);

    // Calculate the difference in days to the provided day of the week
    const daysUntilTargetDay = (dayNumber - sourceDate.day() + 7) % 7;

    // Calculate the target date
    const targetDate = sourceDate.add(daysUntilTargetDay, "day");

    // Combine the target date and time, explicitly specifying your local timezone
    const combinedDateTime = dayjs
      .tz(
        targetDate.format("YYYY-MM-DD") + " " + sourceTime.format("HH:mm"),
        airTime.timezone,
      )
      .tz(localTimeZone);

    lastAirDate = combinedDateTime.toDate();
  }

  return { nextAirDate, lastAirDate };
};
