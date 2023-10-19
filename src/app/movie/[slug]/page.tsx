import Image from "next/image";
import { IMG_URL, tmdb } from "src/utils/tmdb";
import { Container, Text } from "@mantine/core";
import type { Genre } from "moviedb-promise";
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import slug from "src/utils/slug";
import type { Metadata } from "next";
import RatingRing from "src/components/Media/RatingRing";
import UserActions from "src/components/MediaPage/UserActions/UserActions";
import { api } from "src/trpc/server";

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

  return (
    <>
      <div className="relative">
        <div className="absolute left-0 top-0 h-full w-full brightness-[0.25]">
          <Image
            src={IMG_URL(movie.backdrop_path)}
            priority
            alt="movie backdrop"
            className="h-full w-full object-cover"
            fill
            sizes="100vw"
          />
        </div>
        <Container className="relative grid h-full place-items-center py-10 sm:flex sm:items-center sm:py-20">
          <div className="flex flex-col items-center justify-center">
            <Image
              height={450}
              width={300}
              alt="movie poster"
              src={IMG_URL(movie.poster_path)}
              className="flex-1 rounded-md"
              placeholder="blur"
              blurDataURL={`/_next/image?url=${IMG_URL(
                movie.poster_path,
              )}&w=16&q=1`}
            />
          </div>

          <div className="mt-8 flex flex-1 flex-col sm:ml-8 sm:max-w-2xl">
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

  return movieData;
};

const getInitialStatus = async (id: number) => {
  try {
    const { status } = (await api.list.getEntry.query({
      mediaId: id,
      mediaType: "MOVIE",
    })) ?? { status: null };

    console.log(status, "status");

    return status;
  } catch (error) {
    return undefined;
  }
};
