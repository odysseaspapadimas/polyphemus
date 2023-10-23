"use client";

import { Group, TextInput, Transition } from "@mantine/core";
import { useClickOutside, useDebouncedValue, useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const Search = () => {
    const router = useRouter();
  const smallerThan992 = useMediaQuery("(max-width: 992px)", true, {
    getInitialValueInEffect: true,
  });

  const smallerThan612 = useMediaQuery("(max-width: 612px)", true, {
    getInitialValueInEffect: true,
  });

  const searchFade = {
    in: { opacity: 1, width: !smallerThan992 ? "300px" : "100%" },
    out: { opacity: 0, width: 0 },
    transitionProperty: "opacity, width",
  };
  const inputRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const [showInput, showInputHandler] = useDisclosure(false, {
    onOpen: () =>
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200), //0.2s delay just like the animation
  });

  const ref = useClickOutside(showInputHandler.close, ["mouseup", "touchend"]);

  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(encodeURIComponent(query), 200);

  const onChangeQuery = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClearQuery = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!query) return;
    setQuery("");
    showInputHandler.close();
    router.push("/search?q=" + encodeURIComponent(query) + "&page=1");
  };

  return (
    <Group ref={ref} className="">
      <div
        className={`z-20  ${
          smallerThan612
            ? "absolute left-1/2 top-[71px] w-[95%] -translate-x-1/2"
            : ""
        }`}
      >
        <Transition
          mounted={showInput}
          transition={searchFade}
          exitDuration={500}
          duration={500}
        >
          {(styles) => (
            <div className="relative">
              <form onSubmit={handleSubmit}>
                <TextInput
                  placeholder="e.g The Office"
                  style={styles}
                  value={query}
                    classNames={{
                      input: `${!!query && showInput && "rounded-none rounded-t-md"}`
                    }}
                    onChange={onChangeQuery}
                  rightSection={
                    <IconX
                      onClick={handleClearQuery}
                      size={16}
                      className="cursor-pointer text-gray-400 hover:text-white"
                    />
                  }
                />
              </form>
            </div>
          )}
        </Transition>
      </div>

      <button
        onClick={() =>
          showInput ? showInputHandler.close() : showInputHandler.open()
        }
        className="grid h-[38px] w-[38px] cursor-pointer place-items-center rounded-sm border border-transparent transition-all hover:border-primary"
      >
        {!showInput ? <IconSearch spacing="lg" /> : <IconX spacing="lg" />}
      </button>
    </Group>
  );
};
export default Search;
