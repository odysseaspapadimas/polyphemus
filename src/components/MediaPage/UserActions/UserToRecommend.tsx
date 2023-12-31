import { Button } from "@mantine/core";
import type { MovieResponse, ShowResponse } from "moviedb-promise";
import Image from "next/image";
import { useState } from "react";
import type { ArrayElement } from "src/components/Messages/ChatUser";
import { isShowResponse } from "src/lib/tmdb";
import { api } from "src/trpc/react";
import type { RouterOutputs } from "src/trpc/shared";

type Props = {
  user: ArrayElement<RouterOutputs["messages"]["searchUsers"]>;
  media: MovieResponse | ShowResponse;
};

const UserToRecommend = ({ user, media }: Props) => {
  const sendMessage = api.messages.send.useMutation({
    onMutate: () => {
      setSent(true);
    },
  });

  const [sent, setSent] = useState(false);

  const handleSend = () => {
    sendMessage.mutate({
      content: "",
      to: user.username!,
      mediaId: media.id!,
      mediaType: isShowResponse(media) ? "SHOW" : "MOVIE",
      mediaImage: media.poster_path ?? null,
      mediaName: isShowResponse(media)
        ? media.name ?? "Undefined"
        : media.title ?? "Undefined",
      spoilerDescription: null,
      spoilerMedia: null,
      spoilerEpisode: null,
      spoilerRevealed: null,
      spoilerSeason: null,
    });
  };

  return (
    <div className="flex w-full  items-center space-x-2">
      <Image
        src={user.image ?? ""}
        alt="user avatar"
        width={38}
        height={38}
        className="rounded-full"
      />
      <p>{user.username}</p>

      <div className="pr-auto flex flex-1">
        <Button
          size="xs"
          className="ml-auto"
          color={sent ? "gray" : "blue"}
          disabled={sent}
          onClick={handleSend}
        >
          {sent ? "Sent" : "Send"}
        </Button>
      </div>
    </div>
  );
};
export default UserToRecommend;
