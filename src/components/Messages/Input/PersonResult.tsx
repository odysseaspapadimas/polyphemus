import { IconUser } from "@tabler/icons-react";
import type { PersonResult as PersonResultType } from "moviedb-promise";
import Image from "next/image";
import { IMG_URL } from "src/lib/tmdb";

const PersonResult = ({
  onClick,
  result,
}: {
  onClick: (result: PersonResultType) => void;
  result: PersonResultType;
}) => {
  return (
    <div
      onClick={() => onClick(result)}
      className="flex cursor-pointer items-center space-x-2 rounded-md p-2 hover:bg-primary"
    >
      {result.profile_path ? (
        <Image
          src={IMG_URL(result.profile_path)}
          alt="person profile"
          width={50}
          height={75}
        />
      ) : (
        <div className="grid h-[75px] w-[50px] place-items-center bg-slate-800">
          <IconUser />
        </div>
      )}
      <p>{result.name}</p>
    </div>
  );
};

export default PersonResult;
