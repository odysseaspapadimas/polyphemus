import { api } from "src/trpc/react";

const useAddToList = () => {
  const utils = api.useContext();
  const addToList = api.list.add.useMutation({
    onMutate: async ({ mediaId, mediaType, status }) => {
      await utils.list.getEntry.cancel();

      console.log('setdata')
      utils.list.getEntry.setData({ mediaId, mediaType }, () => ({ status }));
    },
    onSuccess: async ({ mediaId, mediaType }) => {
      await utils.list.getEntry.invalidate({ mediaId, mediaType });
    },
  });

  return addToList;
};
export default useAddToList;
