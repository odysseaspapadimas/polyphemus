"use client";

import {
  Avatar,
  Center,
  Loader,
  Modal,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconEdit } from "@tabler/icons-react";
import Link from "next/link";
import { type ChangeEvent, useState } from "react";
import { api } from "src/trpc/react";

type Props = {
  showModal: boolean;
  setShowModal: (showModal: boolean) => void;
};

const NewMessage = ({ showModal, setShowModal }: Props) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 500);
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.currentTarget.value);
  };

  const queryResults = api.messages.searchUsers.useQuery(
    {
      query: debouncedQuery,
    },
    {
      enabled: !!debouncedQuery,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const suggestedQuery = api.messages.suggestedUsers.useQuery(undefined, {
    enabled: showModal,
  });

  return (
    <>
      <Tooltip
        label="Send a new message"
        classNames={{ tooltip: "bg-dark text-white" }}
      >
        <div>
          <IconEdit
            onClick={() => setShowModal(true)}
            className="cursor-pointer rounded-md p-1 hover:bg-dark-bg-hover"
            size={32}
          />
        </div>
      </Tooltip>
      <Modal
        opened={showModal}
        onClose={() => setShowModal(false)}
        trapFocus
        title="Send a new message"
      >
        <TextInput
          data-autofocus
          value={query}
          onChange={handleChange}
          placeholder="Search for a user"
        />

        {debouncedQuery && queryResults.data && queryResults.data.length > 0 ? (
          <div className="my-2 flex flex-col space-y-2">
            {queryResults.data.map((user) => (
              <UserToSend
                key={user.username}
                user={user}
                setShowModal={setShowModal}
              />
            ))}
          </div>
        ) : debouncedQuery && queryResults.isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : (
          query &&
          queryResults.data?.length === 0 && (
            <p>No user found with that username</p>
          )
        )}
        {!debouncedQuery && (
          <>
            <h2 className="text-medium mx-auto mt-2 w-fit border-b-2 pb-1 text-2xl">
              Suggested
            </h2>
            <div className="my-2 flex flex-col space-y-2">
              {suggestedQuery.data &&
                suggestedQuery.data?.map((user) => (
                  <UserToSend
                    key={user.username}
                    user={user}
                    setShowModal={setShowModal}
                  />
                ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
};
export default NewMessage;

const UserToSend = ({
  user,
  setShowModal,
}: {
  user: { username: string | null; image: string | null | undefined };
  setShowModal: (showModal: boolean) => void;
}) => (
  <Link
    key={user.username}
    href={`/messages/${user.username}`}
    className="flex items-center rounded-md px-2 py-2 hover:bg-dark"
    onClick={() => setShowModal(false)}
  >
    <Avatar
      src={user.image}
      alt="user avatar"
      className="h-10 w-10 rounded-full"
    />
    <p className="ml-3 font-semibold hover:text-gray-200">{user.username}</p>
  </Link>
);
