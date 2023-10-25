import { api } from "src/trpc/react";

const useAddToList = () => {
  const utils = api.useContext();
  const addToList = api.list.add.useMutation({
    onMutate: async ({ mediaId, mediaType, status }) => {
      await utils.list.getEntry.cancel();
      utils.list.getEntry.setData({ mediaId, mediaType }, () => ({ status }));
    },
    onSettled: async () => {
      await utils.list.getEntry.invalidate();
      await utils.list.get.invalidate();
    },
  });

  return addToList;
};
export default useAddToList;
