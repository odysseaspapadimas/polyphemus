import Image from "next/image";
import { IMG_URL, tmdb } from "src/lib/tmdb";
import { Container, Text } from "@mantine/core";
import type { CreditsResponse, Genre, MovieResponse } from "moviedb-promise";
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import slug from "src/lib/slug";
import type { Metadata } from "next";
import RatingRing from "src/components/Media/RatingRing";
import UserActions from "src/components/MediaPage/UserActions/UserActions";
import { api } from "src/trpc/server";
import { getPlaiceholder } from "plaiceholder";
import { IconPhotoOff } from "@tabler/icons-react";
import Credits from "src/components/Movie/Credits";
import FriendActivity from "src/components/MediaPage/FriendActivity";

type Props = {
  params: {
    slug: string;
  };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const movie = await getMovieInfo(params.slug);
  return {
    title: movie.title,
  };
}

const MoviePage = async ({ params }: Props) => {
  const movie = await getMovieInfo(params.slug);

  if (!params.slug.split("-").slice(1).join("-")) {
    redirect(`/movie/${slug(movie.title)}-${movie.id}`);
  }

  const status = await getInitialStatus(movie.id!);

  const friendActivity = await getFriendActivity(movie.id!);

  let base64;
  if (movie.poster_path) {
    const buffer = await fetch(IMG_URL(movie.poster_path, 300)).then(
      async (res) => Buffer.from(await res.arrayBuffer()),
    );

    const res = await getPlaiceholder(buffer);
    base64 = res.base64;
  }

  return (
    <>
      <div className="relative">
        <div className="absolute left-0 top-0 h-full w-full brightness-[0.25] md:h-screen-header">
          {movie.backdrop_path && (
            <Image
              src={IMG_URL(movie.backdrop_path)}
              priority
              alt="movie backdrop"
              className="h-full w-full object-cover"
              fill
              sizes="100vw"
            />
          )}
        </div>
        <Container className="relative grid h-full place-items-center py-10 sm:flex sm:items-center sm:py-20 md:h-screen-header">
          <div className="flex flex-col items-center justify-center">
            {movie.poster_path ? (
              <Image
                height={450}
                width={300}
                alt="movie poster"
                src={IMG_URL(movie.poster_path, 300)}
                className="flex-1 rounded-md"
                placeholder={movie.poster_path ? "blur" : undefined}
                blurDataURL={base64}
              />
            ) : (
              <div className="grid h-[450px] w-[300px] place-items-center rounded-md bg-gray-700">
                <IconPhotoOff />
              </div>
            )}

            {friendActivity && <FriendActivity activity={friendActivity} />}
          </div>

          <div className="mt-8 flex flex-1 flex-col justify-center sm:ml-8 sm:mt-0 sm:max-w-2xl">
            <div className="flex">
              <p className="text-3xl font-semibold">
                {movie.title}
                <span className="text-2xl">
                  {" "}
                  ({movie.release_date?.split("-")[0]})
                </span>
              </p>
            </div>

            <div className="flex space-x-2">
              {movie.release_date} &bull;{" "}
              {movie.genres?.map((genre: Genre, i: number) => (
                <React.Fragment key={i}>
                  <Link
                    href={`/movies?genres=${genre.name
                      ?.split(" ")[0]!
                      .toLowerCase()}`}
                    className="hover:underline"
                  >
                    {genre.name}
                  </Link>
                  {i < movie.genres!.length - 1 && ", "}
                </React.Fragment>
              ))}{" "}
              &bull; {movie.runtime}m
            </div>

            <div className="flex flex-col items-center sm:my-4 sm:flex-row">
              <RatingRing
                vote_average={movie.vote_average}
                vote_count={movie.vote_count}
                media={movie}
              />

              {status !== undefined && (
                <UserActions
                  mediaId={movie.id!}
                  mediaType="MOVIE"
                  status={status}
                  mediaImage={movie.poster_path}
                  mediaName={movie.title}
                  media={movie}
                />
              )}
              {/* {user && (
              <div className="flex flex-col space-y-4 sm:ml-8">
                <div className="flex justify-around items-center space-x-8">
                  <AlreadyWatched onList={onList} handler={handleWatched} />
                  <PlanToWatch onList={onList} handler={handlePlan} />
                  <Favorite onList={onList} handler={handleFavorite} />
                  <Rate
                    id={movieId}
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
                  movie={movie}
                />
              </div>
            )} */}
            </div>

            <div>
              <p className="my-2 text-2xl font-medium">Overview</p>
              <Text>
                {movie.overview
                  ? movie.overview
                  : "There's no available overview."}
              </Text>
            </div>
          </div>
        </Container>
      </div>
      <Container>
        <Credits credits={movie.credits} />
      </Container>
    </>
  );
};
export default MoviePage;

const getMovieInfo = async (slug: string) => {
  //split the slug to get the id format is movie-name-whatver-id
  const id = slug.split("-").pop()!;
  const movieData = await tmdb.movieInfo({
    id,
    append_to_response: "credits",
  });

  return movieData as MovieResponse & { credits: CreditsResponse };
};

const getInitialStatus = async (id: number) => {
  try {
    const { status } = (await api.list.getEntry.query({
      mediaId: id,
      mediaType: "MOVIE",
    })) ?? { status: null };

    return status;
  } catch (error) {
    return undefined;
  }
};

const getFriendActivity = async (id: number) => {
  const res = await api.media.friendActivity.query({
    mediaId: id,
    mediaType: "MOVIE",
  });

  return res;
};
