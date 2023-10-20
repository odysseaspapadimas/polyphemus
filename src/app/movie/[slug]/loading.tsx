import { Container, Skeleton } from "@mantine/core";

export default function Loading() {
  return (
    <Container className="relative grid place-items-center sm:flex sm:items-center py-10 sm:py-20">
      <Skeleton className="rounded-md" height={450} width={300} />

      <div className="flex flex-1 flex-col sm:ml-8 w-full mt-2">
        <Skeleton height={73} className="mt-8 " />

        <div className="py-16"></div>

        <Skeleton height={50} width={120} mb={8} />

        <Skeleton height={150} />
      </div>
    </Container>
  );
}
