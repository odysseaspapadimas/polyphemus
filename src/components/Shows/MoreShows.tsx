"use client";

import { Button, Center } from "@mantine/core";
import { useState } from "react";
import ShowsSection from "./ShowsSection";

const MoreShows = () => {
  const [page, setPage] = useState(1);

  return (
    <>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
        {new Array(page).fill(0).map((_, i) => (
          <ShowsSection key={i} page={i + 1} />
        ))}
      </div>
      <Center className="py-8">
        <Button onClick={() => setPage((p) => p + 1)}>Load More</Button>
      </Center>
    </>
  );
};
export default MoreShows;
