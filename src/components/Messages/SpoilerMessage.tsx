import { Button, Group, Modal, Overlay } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { Message } from "prisma/generated/zod";
import { api } from "src/trpc/react";

type Props = {
  mine: boolean;
  message: Message;
  last: boolean;
};

const SpoilerMessage = ({ mine, last, message }: Props) => {
  const [opened, { open, close }] = useDisclosure(false);

  const utils = api.useContext();
  const revealSpoiler = api.messages.revealSpoiler.useMutation({
    onSuccess: async () => {
      await utils.messages.getChat.invalidate({
        username: message.senderUsername,
      });
      await utils.messages.getChats.invalidate();
    },
  });

  const handleReveal = async () => {
    await revealSpoiler.mutateAsync({ messageId: message.id });
    close();
  };

  return (
    <>
      <div>
        <div className="relative grid place-items-center">
          <p
            className={`${
              mine
                ? " rounded-br-none border border-primary bg-primary"
                : " rounded-bl-none border border-dark bg-dark"
            } my-1 break-all rounded-md px-6 py-4`}
          >
            {message.content}
          </p>
          <Button
            color="gray"
            size="sm"
            className="absolute z-[201]"
            onClick={open}
          >
            Reveal
          </Button>
          <Overlay blur={10} />
        </div>
        <p className="self-end text-sm text-gray-400">
          {last && mine && message.read && "Read"}
        </p>
      </div>
      <Modal opened={opened} onClose={close} size="md">
        <Modal.Title className="whitespace-nowrap text-xl font-semibold">
          Are you sure you want to reveal this spoiler?
        </Modal.Title>
        <Modal.Body pt={6}>
          <h2 className="text-lg font-semibold">
            This will reveal a spoiler for:
          </h2>
          {message.spoilerMedia}
          {message.spoilerSeason && <p>Season {message.spoilerSeason}</p>}
          {message.spoilerEpisode && <p>Episode {message.spoilerEpisode}</p>}

          <p>Description: {message.spoilerDescription}</p>

          <Group>
            <Button
              onClick={handleReveal}
              variant="outline"
              color="green"
              className="mt-2"
            >
              Yes
            </Button>
            <Button onClick={close} className="mt-2">
              No
            </Button>
          </Group>
        </Modal.Body>
      </Modal>
    </>
  );
};
export default SpoilerMessage;
