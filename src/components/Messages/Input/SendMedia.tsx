"use client";

import { Center, Loader, Popover, TextInput } from "@mantine/core";
import { useDebouncedState } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { api } from "src/trpc/react";
import PersonResult from "./PersonResult";
import MediaResult from "./MediaResult";
import type {
  MovieResult,
  PersonResult as PersonResultType,
  TvResult,
} from "moviedb-promise";
import { useState } from "react";

type Props = {
  handleSend: (media?: MovieResult | TvResult | PersonResultType) => void;
};

const SendMedia = ({ handleSend }: Props) => {
  const [value, setValue] = useDebouncedState("", 200);

  const [opened, setOpened] = useState(false);

  const searchQuery = api.media.search.useQuery(
    { query: value },
    {
      enabled: !!value,
    },
  );

  return (
    <Popover
      position="top-start"
      opened={opened}
      onChange={() => setOpened((o) => !o)}
      withArrow
      trapFocus
      offset={14}
      width={300}
      arrowOffset={12}
    >
      <Popover.Target>
        <IconPlus
          onClick={() => setOpened((o) => !o)}
          className="cursor-pointer  hover:text-primary"
        />
      </Popover.Target>
      <Popover.Dropdown h={585}>
        <h2 className="mb-2 text-center">Search media</h2>
        <TextInput
          defaultValue={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />

        <div className="mt-2 flex flex-col space-y-2">
          {value && searchQuery.isLoading ? (
            <Center>
              <Loader />
            </Center>
          ) : (
            searchQuery.data?.map((result) =>
              result.media_type === "person" ? (
                <PersonResult
                  key={result.id}
                  result={result}
                  onClick={() => {
                    handleSend(result);
                    setOpened(false);
                    setValue("");
                  }}
                />
              ) : (
                <MediaResult
                  key={result.id}
                  result={result}
                  onClick={() => {
                    handleSend(result);
                    setOpened(false);
                    setValue("")
                  }}
                />
              ),
            )
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
};
export default SendMedia;
