import { getServerAuthSession } from "src/server/auth";
import SetUsername from "./SetUsername";

const CheckUsername = async () => {
  const session = await getServerAuthSession();

  if (session?.user.username === null) {
    return <SetUsername />;
  } else {
    return <></>;
  }
};
export default CheckUsername;
