import { api } from "src/trpc/react";

const useAddToList = () => {
  const utils = api.useContext();

  const addActivity = api.user.addActivity.useMutation();

  const addToList = api.list.add.useMutation({
    onMutate: async ({ mediaId, mediaType, status }) => {
      await utils.list.getEntry.cancel();
      utils.list.getEntry.setData({ mediaId, mediaType }, () => ({ status }));
    },
    onSuccess: async (
      { mediaId, mediaType },
      { mediaImage, mediaName, status },
    ) => {
      await utils.list.getEntry.invalidate({ mediaId, mediaType });
      await utils.list.get.invalidate();

      await addActivity.mutateAsync({
        mediaId,
        mediaType,
        mediaImage,
        mediaName,
        status,
      });
    },
  });

  return addToList;
};
export default useAddToList;
