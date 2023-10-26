"use client";

import { useViewportSize } from "@mantine/hooks";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  name: string | undefined;
  release_date: string | undefined;
  overview: string | undefined;
  link: string;
};

const MediaInfo = ({ name, release_date, overview, link }: Props) => {
  const titleRef = useRef() as React.MutableRefObject<HTMLHeadingElement>;
  const [lineClamp, setLineClamp] = useState(3);
  const { width } = useViewportSize();

  useEffect(() => {
    if (!titleRef.current || !document.defaultView) return;
    const titleHeight = titleRef.current.offsetHeight;
    setLineClamp(Math.round(5 - titleHeight / 28));
  }, [titleRef, width]);
  return (
    <div className="flex-1 px-4 sm:py-3">
      <Link href={link}>
        <h2 ref={titleRef} className="text-xl font-semibold hover:text-primary">
          {name}
        </h2>
      </Link>
      <p className="text-gray-500">{release_date}</p>
      <p
        style={{
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: lineClamp,
          WebkitBoxOrient: "vertical",
        }}
      >
        {overview}
      </p>
    </div>
  );
};
export default MediaInfo;
