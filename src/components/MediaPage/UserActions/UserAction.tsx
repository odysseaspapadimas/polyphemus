"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import type { Status } from "@prisma/client";
import { IconCheck, IconEye, IconEyeOff, IconPlus } from "@tabler/icons-react";

export type ToggleOnListButtonProps = {
  onList?: Status;
  list: Status;
  handleList: ({ status }: { status: Status }) => void;
};

const listText = {
  COMPLETED: "Completed",
  PLAN_TO_WATCH: "Plan to Watch",
  WATCHING: "Watching",
};

const UserAction = ({ onList, list, handleList }: ToggleOnListButtonProps) => {
  return (
    <Tooltip position="bottom" withArrow withinPortal label={listText[list]}>
      <div>
        <ActionIcon
          variant="filled"
          size="lg"
          className="grid place-items-center rounded-full bg-slate-800 p-3 transition-colors duration-75 hover:bg-slate-900"
          onClick={() => handleList({ status: list })}
          style={{ height: "unset", width: "unset" }}
        >
          {list === "WATCHING" ? (
            <IconEye className={onList === list ? "text-primary" : ""} />
          ) : list === "PLAN_TO_WATCH" ? (
            <IconPlus className={onList === list ? "text-primary" : ""} />
          ) : list === "COMPLETED" ? (
            <IconCheck className={onList === list ? "text-primary" : ""} />
          ) : null}
        </ActionIcon>
      </div>
    </Tooltip>
  );
};
export default UserAction;
