"use client";

import { Button, Center } from "@mantine/core";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const LoadMore = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get("page") ?? "1");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [page]);
  return (
    <Center className="py-8">
      <Link
        href={`${pathname}?page=${page + 1}`}
        scroll={false}
        onClick={() => setLoading(true)}
      >
        <Button loading={loading}>Load More</Button>
      </Link>
    </Center>
  );
};
export default LoadMore;
