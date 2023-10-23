"use client";

import { Center, Pagination as MantinePagination } from "@mantine/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  page: number;
  total_pages: number;
};
const Pagination = ({ page, total_pages }: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (value: number) => {
    router.push(`${pathname}?q=${searchParams.get("q")}&page=${value}`);
  };

  return (
    <Center my={24}>
      <MantinePagination
        value={page}
        onChange={handleChange}
        total={total_pages}
      />
    </Center>
  );
};
export default Pagination;
