import { ScrollArea } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
import type { AggregateCreditsResponse } from "moviedb-promise";
import Image from "next/image";
import Link from "next/link";
import slug from "src/lib/slug";
import { IMG_URL } from "src/lib/tmdb";

const Credits = ({ credits }: { credits: AggregateCreditsResponse }) => {
  return (
    <div className="py-6 sm:w-[85%]">
      <h2 className="mb-4 text-2xl font-semibold">Cast</h2>
      <ScrollArea
        /*viewportRef={scrollRef} */ scrollbarSize={16}
        type="always"
        className="pb-4 "
      >
        <div className="flex space-x-4">
          {credits.cast?.map((cast) => (
            <div
              key={cast.id}
              className="flex flex-col rounded-md border-gray-400"
            >
              {!cast.profile_path ? (
                <Link href={`/person/${slug(`${cast.name}-${cast.id}`)}`}>
                  <div className="grid h-[225px] w-[150px] place-items-center rounded-md bg-gray-700 opacity-80">
                    <IconUser size={46} />
                  </div>
                </Link>
              ) : (
                <Link
                  href={`/person/${slug(`${cast.name}-${cast.id}`)}`}
                  className="relative block h-[225px] w-[150px]"
                >
                  <Image
                    src={IMG_URL(cast.profile_path)}
                    alt="profile image"
                    fill
                    sizes="100%"
                    className="rounded-tl-md rounded-tr-md"
                  />
                </Link>
              )}
              <div className="max-w-[150px] p-2">
                <p className="font-semibold">{cast.name}</p>
                <div>
                  {cast.roles
                    ? cast.roles.map(
                        (role, i) =>
                          i <= 3 && (
                            <p key={role.credit_id ?? i}>{role.character}</p>
                          ),
                      )
                    : null}
                  {cast.roles !== undefined && cast.roles.length - 4 > 0 && (
                    <p>and {cast.roles.length - 4} more...</p>
                  )}
                </div>
                <p className="text-gray-400">
                  {cast.total_episode_count}{" "}
                  {cast.total_episode_count === 1 ? "episode" : "episodes"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
export default Credits;
