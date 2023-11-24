"use client";

import { Select } from "@mantine/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createUrl } from "src/lib/utils";

const Sort = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const type = pathname === "/movies" ? "movies" : "shows";

  const selectData = [
    { value: "popularity.desc", label: "Popularity Descending" },
    { value: "popularity.asc", label: "Popularity Ascending" },
    { value: "vote_average.desc", label: "Rating Descending" },
    { value: "vote_average.asc", label: "Rating Ascending" },
    {
      value: type === "movies" ? "release_date.desc" : "first_air_date.desc",
      label: "Release Date Descending",
    },
    {
      value: type === "movies" ? "release_date.asc" : "first_air_date.asc",
      label: "Release Date Ascending",
    },
  ];

  return (
    <div>
      <p>Sort by</p>
      <Select
        className="min-w-fit self-center"
        value={searchParams.get("sort_by") ?? selectData[0]?.value}
        onChange={(value) => {
          const newParams = new URLSearchParams(searchParams.toString());

          if (value === selectData[0]?.value) {
            newParams.delete("sort_by");
          } else if (value) {
            newParams.set("sort_by", value);
          }

          router.push(createUrl("/" + type, newParams));
        }}
        data={selectData}
      />
    </div>
  );
};
export default Sort;
