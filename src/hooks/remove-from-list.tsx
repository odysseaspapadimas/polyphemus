import { api } from "src/trpc/react";

const useRemoveFromList = () => {
  const utils = api.useContext();

  const removeActivity = api.user.removeActivity.useMutation();

  const removeFromList = api.list.remove.useMutation({
    onMutate: async ({ mediaId, mediaType, status, replace }) => {
      await utils.list.getEntry.cancel();
      utils.list.getEntry.setData({ mediaId, mediaType }, () =>
        replace ? { status } : null,
      );
    },
    onSuccess: async ({ mediaId, mediaType, status }) => {
      await utils.list.getEntry.invalidate({ mediaId, mediaType });
      await utils.list.get.invalidate();

      await removeActivity.mutateAsync({ mediaId, mediaType, status });
    },
  });

  return removeFromList;
};
export default useRemoveFromList;
