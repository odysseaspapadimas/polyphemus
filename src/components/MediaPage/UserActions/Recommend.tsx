"use client";

import { Button, Center, Loader, Modal, TextInput } from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import type { MovieResponse, ShowResponse } from "moviedb-promise";
import { type ChangeEvent, useState } from "react";
import { api } from "src/trpc/react";
import UserToRecommend from "./UserToRecommend";

type Props = {
  media: MovieResponse | ShowResponse;
};

const Recommend = ({ media }: Props) => {
  const [opened, { open, close }] = useDisclosure(false);

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

  return (
    <>
      <Button onClick={open}>Recommend this</Button>

      <Modal opened={opened} onClose={close}>
        <h2 className="text-lg font-semibold">Select a user</h2>

        <TextInput
          data-autofocus
          value={query}
          onChange={handleChange}
          placeholder="Search for a user"
        />

        {debouncedQuery && queryResults.data && queryResults.data.length > 0 ? (
          <div className="my-2 flex flex-col space-y-2">
            {queryResults.data.map(
              (user) =>
                user.username && (
                  <UserToRecommend
                    key={user.username}
                    user={user}
                    media={media}
                  />
                ),
            )}
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
        {/* {!debouncedQuery && (
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
        )} */}
      </Modal>
    </>
  );
};
export default Recommend;
