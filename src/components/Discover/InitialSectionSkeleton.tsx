import { Skeleton } from "@mantine/core";

const InitialSectionSkeleton = () => {
  return (
    <div className="relative grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-2">
      {new Array(20).fill(0).map((_, i) => (
        <div key={i} className="aspect-[1/1.5] w-[160px]">
          <Skeleton className="aspect-[1/1.5] w-[160px]" />
          <Skeleton className="h-[24px] w-full mt-1" />
        </div>
      ))}
    </div>
  );
};
export default InitialSectionSkeleton;
