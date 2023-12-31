import { IconActivity } from "@tabler/icons-react";
import Link from "next/link";

const Activity = () => {
  return (
    <Link href='/activity' className="grid h-[38px] w-[38px] cursor-pointer place-items-center rounded-sm border border-transparent transition-all hover:border-primary">
      <IconActivity />
    </Link>
  );
};
export default Activity;
