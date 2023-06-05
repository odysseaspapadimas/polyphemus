import { ActionIcon, Menu } from "@mantine/core";
import {
  IconChevronRight,
  IconDots,
  IconEye,
  IconHeart,
  IconPlus,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { MovieType, TVShowType } from "src/constants/types";
import { showNotification as _showNotification } from "@mantine/notifications";

import { IMG_URL } from "src/utils/tmdb";

const isMovieResponse = (
  filters: MovieType | TVShowType
): filters is MovieType => {
  return (filters as MovieType)["title"] !== undefined; //movies have title shows have name
};

const Media = ({ data }: { data: MovieType | TVShowType }) => {
  const router = useRouter();

  let name: string, release_date, link;

  if (isMovieResponse(data)) {
    name = data.title;
    release_date = data.release_date.split("-")[0];
    link =
      "/movie/" +
      data.id +
      "-" +
      data.title.toLowerCase().replace(/[\W_]+/g, "-");
  } else {
    name = data.name;
    release_date = data.first_air_date?.split("-")[0];
    link =
      "/show/" +
      data.id +
      "-" +
      data.name.toLowerCase().replace(/[\W_]+/g, "-");
  }

  const { data: session } = useSession();

  const showNotification = ({
    title,
    msg,
    list,
  }: {
    title: string;
    msg: string;
    list: "watched" | "plan" | "favorites";
  }) => {
    _showNotification({
      title,
      message: (
        <div>
          <div>{msg}</div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <IconChevronRight />
          </div>
        </div>
      ),
      onClick: () => router.push(`/u/${session?.user.username}?list=${list}`),
      classNames: { body: "cursor-pointer" },
    });
  };

  //   const handleWatched = async () => {
  //     if (!onList.on.includes("watched")) {
  //       await addToList("watched", String(data.id), type);

  //       showNotification({
  //         title: "Added to Already Watched list",
  //         msg: `'${name}' was successfully added to your list`,
  //         list: "watched",
  //       });

  //       if (onList.on.includes("plan")) {
  //         await removeFromList("plan", String(data.id), type);
  //         showNotification({
  //           title: "Removed from Plan to Watch list",
  //           msg: `'${name}' was successfully removed from your list`,
  //           list: "plan",
  //         });
  //       }
  //     } else if (onList.on.includes("watched")) {
  //       await removeFromList("watched", String(data.id), type);
  //       showNotification({
  //         title: "Removed from Already Watched list",
  //         msg: `'${name}' was successfully removed from your list`,
  //         list: "plan",
  //       });
  //     }

  //     mutateOnList();
  //   };

  //   const handlePlan = async () => {
  //     if (!onList.on.includes("plan")) {
  //       await addToList("plan", String(data.id), type);

  //       showNotification({
  //         title: "Added to Plan to Watch list",
  //         msg: `'${name}' was successfully added to your list`,
  //         list: "plan",
  //       });

  //       if (onList.on.includes("watched")) {
  //         await removeFromList("watched", String(data.id), type);
  //         showNotification({
  //           title: "Removed from Already Watched list",
  //           msg: `'${name}' was successfully removed from your list`,
  //           list: "watched",
  //         });
  //       }
  //     } else if (onList.on.includes("plan")) {
  //       await removeFromList("plan", String(data.id), type);
  //       showNotification({
  //         title: "Removed from Plan to Watch list",
  //         msg: `'${name}' was successfully removed from your list`,
  //         list: "plan",
  //       });
  //     }
  //     mutateOnList();
  //   };

  //   const handleFavorite = async () => {
  //     console.log("hi");
  //     if (!onList.on.includes("favorites")) {
  //       await addToList("favorites", String(data.id), type);
  //       showNotification({
  //         title: "Added to Favorites list",
  //         msg: `'${name}' was successfully added to your list`,
  //         list: "favorites",
  //       });
  //     } else if (onList.on.includes("favorites")) {
  //       await removeFromList("favorites", String(data.id), type);
  //       showNotification({
  //         title: "Removed from Favorites list",
  //         msg: `'${name}' was successfully removed from your list`,
  //         list: "favorites",
  //       });
  //     }
  //     mutateOnList();
  //   };

  return (
    <div className="relative w-[140px] sm:w-[150px]">
      <div
        className="absolute left-2 top-2 z-10 grid h-[34px] w-[34px] place-items-center rounded-full border-[3px]"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          borderColor: `hsl(${(115 * data.vote_average) / 10}, 100%, 28%)`,
        }}
      >
        <span>{Math.round(data.vote_average * 10) / 10}</span>
      </div>
      <Link href={link} className="">
        <div
          className="relative w-[140px] cursor-pointer rounded-sm border border-transparent hover:border-blue-400 sm:w-[150px]"
          style={{ aspectRatio: "1 / 1.5" }}
        >
          <Image
            src={IMG_URL(data.poster_path)}
            alt="poster"
            fill
            placeholder="blur"
            blurDataURL={`/_next/image?url=${IMG_URL(
              data.poster_path
            )}&w=16&q=1`}
          />
        </div>
      </Link>
      {session && (
        <div className="absolute right-2 top-2">
          <Menu
            position="bottom-end"
            classNames={{
              item: "px-2 whitespace-nowrap",
            }}
          >
            <Menu.Target>
              <ActionIcon
                className="transition-colors duration-75 "
                sx={(theme) => ({
                  "&:hover": {
                    backgroundColor: theme.colors.dark[6],
                  },
                })}
              >
                <IconDots />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Add to list</Menu.Label>
              <Menu.Item
                // onClick={handleWatched}
                icon={
                  <IconEye
                    size={14}
                    // className={
                    //    onList?.on.includes("watched") ? "text-primary" : ""
                    // }
                  />
                }
              >
                Already Watched
              </Menu.Item>
              <Menu.Item
                // onClick={handlePlan}
                icon={
                  <IconPlus
                    size={14}
                    // className={
                    //    onList?.on.includes("plan") ? "text-primary" : ""
                    // }
                  />
                }
              >
                Plan to Watch
              </Menu.Item>
              <Menu.Item
                // onClick={handleFavorite}
                icon={
                  <IconHeart
                    size={14}
                    // className={
                    //    onList?.on.includes("favorites") ? "text-red-500" : ""
                    // }
                  />
                }
              >
                Favorite
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      )}
      <p className=" mt-1 text-base font-semibold">
        {name} ({release_date})
      </p>
    </div>
  );
};
export default Media;
