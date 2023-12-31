import {
  Button,
  Center,
  Group,
  Loader,
  Popover,
  Select,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useDebouncedState } from "@mantine/hooks";
import { IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "src/trpc/react";
import MediaResult from "./MediaResult";
import type { MovieResult, TvResult } from "moviedb-promise";
import SelectedMedia from "./SelectedMedia";
import { isShowResponse } from "src/lib/tmdb";

type Props = {
  spoilerDescription: string;
  setSpoilerDescription: React.Dispatch<React.SetStateAction<string>>;
  selectedMedia: MovieResult | TvResult | null;
  setSelectedMedia: React.Dispatch<
    React.SetStateAction<MovieResult | TvResult | null>
  >;
  selectedSeason: number | null;
  setSelectedSeason: React.Dispatch<React.SetStateAction<number | null>>;
  selectedEpisode: number | null;
  setSelectedEpisode: React.Dispatch<React.SetStateAction<number | null>>;
};

const Spoiler = ({
  spoilerDescription,
  setSpoilerDescription,
  selectedMedia,
  setSelectedMedia,
  selectedSeason,
  setSelectedSeason,
  selectedEpisode,
  setSelectedEpisode,
}: Props) => {
  const [opened, setOpened] = useState(false);
  const [activated, setActivated] = useState(false);

  const [query, setQuery] = useDebouncedState("", 200);

  const [selectedType, setSelectedType] = useState<"MOVIE" | "SHOW" | null>(
    null,
  );

  const searchQuery = api.media.spoilerSearch.useQuery(
    { query: query, type: selectedType },
    {
      enabled: !!query && selectedType !== null,
    },
  );

  const mediaQuery = api.media.details.useQuery(
    { id: selectedMedia?.id, type: selectedType },
    {
      enabled: !!selectedMedia && selectedType !== null,
    },
  );

  const seasonInfoQuery = api.media.season.useQuery(
    { id: selectedMedia?.id, season: selectedSeason },
    { enabled: !!selectedSeason && !!selectedMedia && selectedType === "SHOW" },
  );

  const handleRemoveSelected = () => {
    setSelectedMedia(null);
    setSelectedType(null);
  };

  return (
    <Popover
      position="top-end"
      opened={opened}
      onChange={() => setOpened((o) => !o)}
      withArrow
      width={325}
      offset={16}
      arrowOffset={12}
    >
      <Popover.Target>
        <IconEyeOff
          onClick={() => {
            if (!activated && !opened) {
              setOpened((o) => !o);
            } else if (activated && opened) {
              setOpened(false);
            }
            setActivated((a) => !a);
          }}
          className={`cursor-pointer hover:text-white ${
            activated ? "text-primary" : ""
          }`}
          size={20}
        />
      </Popover.Target>
      <Popover.Dropdown h={700}>
        <p className="text-center">
          Spoiler mode is {activated ? "active" : "not active"}
        </p>

        {!selectedMedia ? (
          <>
            <div className="my-2 flex flex-col items-center text-center">
              <p>What type of content?</p>

              <Group mt={8}>
                <Button
                  onClick={() => setSelectedType("MOVIE")}
                  color={selectedType === "MOVIE" ? "blue" : "gray"}
                >
                  Movie
                </Button>
                <Button
                  onClick={() => setSelectedType("SHOW")}
                  color={selectedType === "SHOW" ? "blue" : "gray"}
                >
                  Show
                </Button>
              </Group>
            </div>

            <div>
              {selectedType && (
                <>
                  <div className="my-2 flex flex-col items-center text-center">
                    <p className="mb-2">
                      What is the name of the {selectedType.toLowerCase()}?
                    </p>
                    <TextInput
                      defaultValue={query}
                      onChange={(e) => setQuery(e.currentTarget.value)}
                    />
                  </div>
                  <div className="mt-2 flex flex-col space-y-2">
                    {query && searchQuery.isLoading ? (
                      <Center>
                        <Loader />
                      </Center>
                    ) : (
                      searchQuery.data?.map((result) => (
                        <MediaResult
                          key={result.id}
                          result={result}
                          onClick={() => {
                            setSelectedMedia(result);
                            setQuery("");
                          }}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div>
            <h2>You&apos;ve selected:</h2>
            <SelectedMedia
              media={selectedMedia}
              handleRemoveSelected={handleRemoveSelected}
            />

            <Textarea
              placeholder="What's the spoiler?"
              className="mt-2"
              value={spoilerDescription}
              onChange={(e) => setSpoilerDescription(e.currentTarget.value)}
              style={{ resize: "none" }}
            />

            {!mediaQuery.isLoading &&
              mediaQuery.data &&
              isShowResponse(mediaQuery.data) && (
                <div className="my-2 flex flex-col items-center text-center">
                  <p className="mb-2">
                    What season and episode is the spoiler from?
                  </p>
                  <Select
                    label="Pick a season (optional)"
                    comboboxProps={{ withinPortal: false }}
                    defaultValue={
                      selectedSeason ? selectedSeason.toString() : undefined
                    }
                    onChange={(value) => {
                      setSelectedSeason(parseInt(value ?? "0"));
                    }}
                    data={
                      mediaQuery.data.seasons
                        ? mediaQuery.data.seasons.map((season) => ({
                            label: season.name ?? "Season name not available",
                            value: season.season_number
                              ? season.season_number.toString()
                              : "Unavailable",
                          }))
                        : undefined
                    }
                  />
                  <div className="mt-2">
                    {!seasonInfoQuery.isLoading &&
                      selectedSeason &&
                      seasonInfoQuery.data && (
                        <Select
                          label="Pick an episode (optional)"
                          comboboxProps={{ withinPortal: false }}
                          defaultValue={
                            selectedEpisode
                              ? selectedEpisode.toString()
                              : undefined
                          }
                          onChange={(value) => {
                            setSelectedEpisode(parseInt(value ?? "0"));
                          }}
                          data={
                            seasonInfoQuery.data?.episodes
                              ? seasonInfoQuery.data.episodes.map(
                                  (episode) => ({
                                    label:
                                      `${episode.episode_number}: ${episode.name}` ??
                                      "Episode not available",
                                    value: episode.episode_number
                                      ? episode.episode_number.toString()
                                      : "Unavailable",
                                  }),
                                )
                              : undefined
                          }
                        />
                      )}
                  </div>
                </div>
              )}
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
export default Spoiler;
