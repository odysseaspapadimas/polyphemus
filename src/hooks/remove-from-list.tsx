import { api } from "src/trpc/react";

const useRemoveFromList = () => {
  const utils = api.useContext();
  const removeFromList = api.list.remove.useMutation({
    onMutate: async ({ mediaId, mediaType, status, replace }) => {
      await utils.list.getEntry.cancel();
      utils.list.getEntry.setData({ mediaId, mediaType }, () =>
        replace ? { status } : null,
      );
    },
    onSettled: async () => {
      await utils.list.getEntry.invalidate();
      await utils.list.get.invalidate();
    },
  });

  return removeFromList;
};
export default useRemoveFromList;
