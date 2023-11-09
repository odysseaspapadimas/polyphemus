import { Container, ScrollArea } from "@mantine/core";
import type { PersonCombinedCreditsResponse } from "moviedb-promise";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import slug from "src/utils/slug";
import { IMG_URL, tmdb } from "src/utils/tmdb";

type Props = {
  params: {
    slug: string;
  };
};

type GroupedCast = Record<string, PersonCombinedCreditsResponse["cast"]>;
type GroupedCrew = Record<string, PersonCombinedCreditsResponse["crew"]>;

const PersonPage = async ({ params }: Props) => {
  const { person, knownFor, credits } = await getData(params.slug);

  console.log(knownFor, "knnownfor");

  if (!params.slug.split("-").slice(1).join("-")) {
    redirect(`/person/${slug(person.name)}-${person.id}`);
  }

  return (
    <Container
      my={36}
      className="relative flex h-full flex-col items-center md:flex-row md:items-start"
    >
      <div>
        {!person.profile_path ? (
          <div className="h-[450px] w-[300px] bg-gray-400 opacity-80"></div>
        ) : (
          <Image
            height={450}
            width={300}
            alt="person poster"
            src={IMG_URL(person.profile_path)}
            className="flex-1 rounded-md"
            placeholder="blur"
            blurDataURL={`/_next/image?url=${IMG_URL(
              person.profile_path,
            )}&w=16&q=1`}
          />
        )}
        <h2 className="whitespace my-2 text-2xl font-semibold">
          Personal Info
        </h2>
        <div className="flex flex-col space-y-6">
          <div>
            <h3 className="text-xl font-semibold">Gender</h3>
            <p>
              {person.gender === 1
                ? "Female"
                : person.gender === 2
                ? "Male"
                : person.gender === 3
                ? "Non-binary"
                : "Not specified"}
            </p>
          </div>

          {person.birthday && (
            <div>
              <h3 className="text-xl font-semibold">Birthday</h3>
              <p>
                {person.birthday} ({getAge(person.birthday)} years old){" "}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold">Place of Birth</h3>
            <p>{person.place_of_birth}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col self-stretch sm:ml-8 sm:mt-0 sm:max-w-lg md:max-w-2xl">
        <h1 className="text-3xl font-bold">{person.name}</h1>
        <h2 className="whitespace my-2 text-2xl font-semibold">Biography:</h2>
        <div>
          {person.biography?.split("\n").map((text, i) => (
            <p key={i} className="mb-4">
              {text}
            </p>
          ))}
        </div>
        <div>
          <h2 className="my-2 text-2xl font-semibold">Known For</h2>
          <ScrollArea scrollbarSize={14} type="always" className="pb-4">
            <div className="flex space-x-2 ">
              {knownFor?.map((media) => (
                <div key={media.id} className="flex flex-col rounded-md">
                  {!media.poster_path ? (
                    <div className="h-[225px] w-[150px] bg-gray-400 opacity-80"></div>
                  ) : (
                    <Link
                      href={`/${
                        media.media_type === "movie" ? "movie" : "show"
                      }/${slug(media.name)}-${media.id}`}
                    >
                      <div className="relative h-[225px] w-[150px]">
                        <Image
                          src={IMG_URL(media.poster_path)}
                          alt="poster"
                          fill
                          sizes="100%"
                          className="rounded-md"
                        />
                      </div>
                    </Link>
                  )}
                  <div className="max-w-[150px] p-2 text-center">
                    <Link
                      href={`/${
                        media.media_type === "movie" ? "movie" : "show"
                      }/${slug(media.name)}-${media.id}`}
                    >
                      <p className="font-medium hover:text-primary">
                        {media.media_type === "movie"
                          ? media.title
                          : media.name}
                      </p>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        <div className="mt-4 flex flex-col rounded-md border border-gray-500 px-4 py-2">
          {/* {credits?.map((media) => (
                            <div key={media.credit_id} className="flex space-x-2">
                                <span>{media.first_air_date ? media.first_air_date.split("-")[0] : media.release_date?.split("-")[0]}</span>
                                <span> - </span>
                                <Link href={`/${media.media_type === "movie" ? "movie" : "show"}/${media.id}-${media.name?.toLowerCase().replace(/[\W_]+/g, "-")}`}>
                                    <span className="hover:text-primary">{media.name ? media.name : media.title}</span>
                                </Link>
                            </div>
                        ))} */}
          <div
            className={`my-3 ${
              person.known_for_department === "Acting" ? "order-1" : "order-2"
            }`}
          >
            <h2 className="text-3xl font-semibold">Acting</h2>
            {credits.cast
              ? Object.keys(credits.cast)
                  .reverse()
                  .map((year) => (
                    <div key={year}>
                      <p className="text-lg font-semibold">
                        {year === "0" ? "-" : year}
                      </p>
                      <div className="ml-4 flex flex-col">
                        {credits.cast
                          ? credits.cast[year]?.map((media) => (
                              <div key={media.credit_id}>
                                <Link
                                  href={`/${
                                    media.media_type === "movie"
                                      ? "movie"
                                      : "show"
                                  }/${slug(media.name)}-${media.id}`}
                                >
                                  <span className="font-bold underline hover:text-primary">
                                    {media.name ? media.name : media.title}
                                  </span>
                                </Link>
                                {media.character && (
                                  <>
                                    <span className="text-gray-200"> as </span>
                                    <span>{media.character}</span>
                                  </>
                                )}
                              </div>
                            ))
                          : null}
                      </div>
                    </div>
                  ))
              : null}
          </div>
          {credits?.crew &&
            Object.keys(credits.crew).map((department) => (
              <div
                key={department}
                className={`my-3 ${
                  person.known_for_department === department
                    ? "order-1"
                    : "order-2"
                }`}
              >
                <h2 className="text-3xl font-semibold">{department}</h2>
                <div className="flex flex-col">
                  {credits.crew
                    ? Object.keys(credits.crew[department] ?? [])
                        .reverse()
                        .map((year) => (
                          <div key={year}>
                            <p className="text-lg font-semibold">
                              {year === "0" ? "-" : year}
                            </p>
                            <div className="ml-4 flex flex-col">
                              {(
                                credits.crew?.[department]?.[
                                  parseInt(year)
                                ] as PersonCombinedCreditsResponse["crew"]
                              )?.map((credit) => (
                                <div key={credit.credit_id}>
                                  <Link
                                    href={`/${
                                      credit.media_type === "movie"
                                        ? "movie"
                                        : "show"
                                    }/${slug(credit.name)}-${credit.id}`}
                                  >
                                    <span className="font-bold underline hover:text-primary">
                                      {credit.name ? credit.name : credit.title}
                                    </span>
                                  </Link>
                                  {credit.job && (
                                    <>
                                      <span className="text-gray-200">
                                        {" "}
                                        as{" "}
                                      </span>
                                      <span>{credit.job}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                    : null}
                </div>
              </div>
            ))}
          {/* {groupedCredits &&
              groupedCredits.map((item: any) => (
                <div key={item.id}>
                  <p className="font-semibold text-lg">{item[0] === "0" ? "-" : item[0]}</p>
                  <div className="ml-4 flex flex-col">
                    {item[1].map((media: CreditCast) => (
                      <div key={media.credit_id}>
                        <Link
                          href={`/${media.media_type === "movie" ? "movie" : "show"
                            }/${media.id}-${media.name
                              ?.toLowerCase()
                              .replace(/[\W_]+/g, "-")}`}
                        >
                          <span className="font-bold hover:text-primary underline">
                            {media.name ? media.name : media.title}
                          </span>
                        </Link>
                        {media.character && (
                          <>
                            <span className="text-gray-200"> as </span>
                            <span>{media.character}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))} */}
        </div>
      </div>
    </Container>
  );
};
export default PersonPage;

const getAge = (dateString: string) => {
  const today = new Date();
  const birthDate = new Date(dateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const getData = async (slug: string) => {
  const id = slug.split("-").pop()!;

  const person = await tmdb.personInfo({ id });

  const credits = await tmdb.personCombinedCredits({ id });

  let knownFor = [] as
    | PersonCombinedCreditsResponse["cast"]
    | PersonCombinedCreditsResponse["crew"];

  if (person.known_for_department === "Acting") {
    knownFor = credits.cast
      ?.slice(0)
      ?.sort((a, b) => {
        //slice(0) creates a new copy as not to mutate the original array
        if (a.popularity && b.popularity) {
          return b.popularity - a.popularity;
        } else {
          return 0;
        }
      })
      .filter((v, i, a) => a.findIndex((v2) => v2.id === v.id) === i)
      .slice(0, 10);
  } else {
    knownFor = credits.crew
      ?.filter((credit) => credit.department === person.known_for_department)
      ?.sort((a, b) => {
        //slice(0) creates a new copy as not to mutate the original array
        if (a.popularity && b.popularity) {
          return b.popularity - a.popularity;
        } else {
          return 0;
        }
      })
      .slice(0, 10);
  }

  //   credits?.sort((a, b) => {
  //     let dateA, dateB;
  //     if (a.release_date) dateA = new Date(a.release_date).getTime();
  //     else if (a.first_air_date) dateA = new Date(a.first_air_date).getTime();
  //     else dateA = 0;

  //     if (b.release_date) dateB = new Date(b.release_date).getTime();
  //     else if (b.first_air_date) dateB = new Date(b.first_air_date).getTime();
  //     else dateB = 0;

  //     return dateB - dateA;
  //   });

  const cast: GroupedCast | undefined = credits?.cast?.reduce(
    (grouped: GroupedCast, credit) => {
      let year;

      const first_air_date = credit.first_air_date?.split("-")[0];
      const release_date = credit.release_date?.split("-")[0];
      if (credit.first_air_date) {
        year = first_air_date;
      } else if (credit.release_date) {
        year = release_date;
      } else {
        year = "0";
      }

      // Check if the year is valid
      // If the year key doesn't exist in the grouped object, create it
      if (year) {
        // If the year key doesn't exist in the grouped object, create it
        if (!grouped[year]) {
          grouped[year] = [];
        }

        // Push the credit to the corresponding year
        grouped[year]?.push(credit); // Type assertion here
      }

      return grouped;
    },
    {},
  );

  const crew: GroupedCrew | undefined = credits.crew?.reduce(
    (group: GroupedCrew, credit) => {
      const { department } = credit;

      if (!department) return group;

      if (!group[department]) {
        group[department] = [];
      }

      group[department]?.push(credit);
      return group;
    },
    {},
  );

  for (const dep in crew) {
    if (crew[dep]) {
      //@ts-expect-error this works
      crew[dep] = crew[dep]?.reduce(
        (
          group: Record<string, PersonCombinedCreditsResponse["crew"]>,
          credit,
        ) => {
          let year;
          const first_air_date = credit.first_air_date?.split("-")[0];
          const release_date = credit.release_date?.split("-")[0];

          if (first_air_date) {
            year = first_air_date;
          } else if (release_date) {
            year = release_date;
          } else {
            year = "0";
          }

          if (!group[year]) {
            group[year] = [];
          }

          group[year]?.push(credit);
          return group;
        },
        {},
      );
    }
  }
  return { person, knownFor, credits: { cast, crew } };
};
