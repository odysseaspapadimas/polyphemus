"use client";

import { Button, Center } from "@mantine/core";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createUrl } from "src/lib/utils";

const LoadMore = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get("page") ?? "1");

  const [loading, setLoading] = useState(false);

  const newParams = new URLSearchParams(searchParams.toString());
  newParams.set("page", (page + 1).toString());

  useEffect(() => {
    setLoading(false);
  }, [page]);
  return (
    <Center className="py-8">
      <Link
        href={createUrl(pathname, newParams)}
        scroll={false}
        onClick={() => setLoading(true)}
      >
        <Button loading={loading}>Load More</Button>
      </Link>
    </Center>
  );
};
export default LoadMore;
