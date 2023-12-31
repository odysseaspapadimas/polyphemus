import { Container } from "@mantine/core";
import Link from "next/link";
import { api } from "src/trpc/server";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import Image from "next/image";
dayjs.extend(updateLocale);
dayjs.extend(relativeTime);
dayjs.updateLocale("en", {
  relativeTime: {
    future: "in %s",
    past: "%s ago",
    s: "a few seconds",
    m: "a minute",
    mm: "%d minutes",
    h: "an hour",
    hh: "%d hours",
    d: "a day",
    dd: "%d days",
    M: "a month",
    MM: "%d months",
    y: "a year",
    yy: "%d years",
  },
});

const ActivityPage = async () => {
  const activity = await api.user.activity.query();

  return (
    <Container my={36}>
      <h1 className="text-3xl font-semibold mb-4">Activity</h1>

      <div className="mx-auto flex flex-col space-y-4 ">
        {activity && activity.length > 0
          ? activity.map((activity) => (
              <div
                key={String(activity.createdAt)}
                className="flex w-full items-center space-x-2 text-sm md:text-base"
              >
                <Link
                  href={`/user/${activity.user.username}`}
                  className="rounded-full border-2 border-transparent hover:border-primary"
                >
                  {activity.user.image ? (
                    <Image
                      src={activity.user.image}
                      alt="user avatar"
                      width={32}
                      height={32}
                      className=" rounded-full"
                    />
                  ) : (
                    <AvatarPlaceholderIcon className="h-8 w-8 rounded-full" />
                  )}
                </Link>
                <p className="flex-[3] text-gray-300">
                  <Link href={`/user/${activity.user.username}`}>
                    <span className="font-bold hover:text-gray-200">
                      {activity.user.username}
                    </span>
                  </Link>
                  {activity.status === "COMPLETED" ? (
                    <>
                      {" "}
                      watched{" "}
                      <MediaLink
                        id={activity.mediaId}
                        media_type={activity.mediaType}
                        media_name={activity.mediaName}
                      />{" "}
                      on {dayjs(activity.createdAt).format("dddd MMM DD, YYYY")}{" "}
                    </>
                  ) : activity.status === "PLAN_TO_WATCH" ? (
                    <>
                      {" "}
                      added{" "}
                      <MediaLink
                        id={activity.mediaId}
                        media_type={activity.mediaType}
                        media_name={activity.mediaName}
                      />{" "}
                      to their plan to watch list
                    </>
                  ) : (
                    activity.status === "WATCHING" && (
                      <>
                        {" "}
                        is watching{" "}
                        <MediaLink
                          id={activity.mediaId}
                          media_type={activity.mediaType}
                          media_name={activity.mediaName}
                        />
                      </>
                    )
                  )}
                </p>
                <p className=" flex-1 whitespace-nowrap text-right text-sm text-gray-300">
                  {dayjs(activity.createdAt).fromNow()}
                </p>
              </div>
            ))
          : activity && activity.length === 0 && <p>No activity yet...</p>}
      </div>
    </Container>
  );
};
export default ActivityPage;

const MediaLink = ({
  id,
  media_type,
  media_name,
}: {
  id: number;
  media_type: "MOVIE" | "SHOW";
  media_name: string | null;
}) => {
  return (
    <Link href={`/${media_type.toLowerCase()}/${id}`}>
      <span className="font-bold underline underline-offset-2 hover:text-gray-200">
        {media_name ?? "Undefined"}
      </span>
    </Link>
  );
};

function AvatarPlaceholderIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      {...props}
      data-avatar-placeholder-icon
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0.877014 7.49988C0.877014 3.84219 3.84216 0.877045 7.49985 0.877045C11.1575 0.877045 14.1227 3.84219 14.1227 7.49988C14.1227 11.1575 11.1575 14.1227 7.49985 14.1227C3.84216 14.1227 0.877014 11.1575 0.877014 7.49988ZM7.49985 1.82704C4.36683 1.82704 1.82701 4.36686 1.82701 7.49988C1.82701 8.97196 2.38774 10.3131 3.30727 11.3213C4.19074 9.94119 5.73818 9.02499 7.50023 9.02499C9.26206 9.02499 10.8093 9.94097 11.6929 11.3208C12.6121 10.3127 13.1727 8.97172 13.1727 7.49988C13.1727 4.36686 10.6328 1.82704 7.49985 1.82704ZM10.9818 11.9787C10.2839 10.7795 8.9857 9.97499 7.50023 9.97499C6.01458 9.97499 4.71624 10.7797 4.01845 11.9791C4.97952 12.7272 6.18765 13.1727 7.49985 13.1727C8.81227 13.1727 10.0206 12.727 10.9818 11.9787ZM5.14999 6.50487C5.14999 5.207 6.20212 4.15487 7.49999 4.15487C8.79786 4.15487 9.84999 5.207 9.84999 6.50487C9.84999 7.80274 8.79786 8.85487 7.49999 8.85487C6.20212 8.85487 5.14999 7.80274 5.14999 6.50487ZM7.49999 5.10487C6.72679 5.10487 6.09999 5.73167 6.09999 6.50487C6.09999 7.27807 6.72679 7.90487 7.49999 7.90487C8.27319 7.90487 8.89999 7.27807 8.89999 6.50487C8.89999 5.73167 8.27319 5.10487 7.49999 5.10487Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
