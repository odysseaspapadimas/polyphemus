import { Container, Skeleton } from "@mantine/core";

const Loading = () => {
  return (
    <div>
      <div className="bg-gray-600">
        <Container className="flex items-center space-x-4 py-4">
          <Skeleton width={75} height={112.5} className="rounded-md" />
          <div>
            <Skeleton width={200} height={36} mb={2} className="rounded-sm" />
            <Skeleton width={129} height={24} className="rounded-sm" />
          </div>
        </Container>
      </div>

      <Container my={16}>
        <div className="flex flex-col space-y-8 w-full">
          <div className="flex space-x-4 w-full">
            <Skeleton width={125} height={175} className="rounded-l-md" />
            <div className="flex flex-col flex-wrap w-full">
              <Skeleton width={232} height={32} className="rounded-sm" />
              <Skeleton
                width={380}
                height={24}
                className="mb-4 mt-2 rounded-sm"
              />
              <Skeleton height={48} className="w-full rounded-sm" />
            </div>
          </div>
          <div className="flex space-x-4 w-full">
            <Skeleton width={125} height={175} className="rounded-l-md" />
            <div className="flex flex-col flex-wrap w-full">
              <Skeleton width={232} height={32} className="rounded-sm" />
              <Skeleton
                width={380}
                height={24}
                className="mb-4 mt-2 rounded-sm"
              />
              <Skeleton height={48} className="w-full rounded-sm" />
            </div>
          </div>
          <div className="flex space-x-4 w-full">
            <Skeleton width={125} height={175} className="rounded-l-md" />
            <div className="flex flex-col flex-wrap w-full">
              <Skeleton width={232} height={32} className="rounded-sm" />
              <Skeleton
                width={380}
                height={24}
                className="mb-4 mt-2 rounded-sm"
              />
              <Skeleton height={48} className="w-full rounded-sm" />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};
export default Loading;
