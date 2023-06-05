import { useSession } from "next-auth/react";

const SchedulePage = () => {
  const { data } = useSession();

  console.log(data, "data");
  return <div>schedule</div>;
};

SchedulePage.requireAuth = true;

export default SchedulePage;
