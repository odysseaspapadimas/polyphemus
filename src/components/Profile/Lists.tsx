"use client";

import type { StatusType } from "prisma/generated/zod";
import { useState } from "react";
import List from "./List";
import Link from "next/link";

type Props = {
  selectedList: StatusType;
};

const Lists = ({ selectedList }: Props) => {
  //   const tabs = ["WATCHING", "PLAN_TO_WATCH", "COMPLETED"];

  const [selectedTab, setSelectedTab] = useState<StatusType>(selectedList);

  const handleTabChange = (newTab: StatusType) => {
    setSelectedTab(newTab);
  };

  return (
    <div>
      <div className="mt-6 flex items-center justify-center space-x-4 sm:justify-start">
        <Link
          href={`?list=watching`}
          onClick={() => handleTabChange("WATCHING")}
          className={selectedTab === "WATCHING" ? "" : "text-gray-400"}
        >
          Watching
        </Link>
        <span>/</span>
        <Link
          href={"?list=plan_to_watch"}
          onClick={() => handleTabChange("PLAN_TO_WATCH")}
          className={selectedTab === "PLAN_TO_WATCH" ? "" : "text-gray-400"}
        >
          Plan to Watch
        </Link>
        <span>/</span>
        <Link
          href={"?list=completed"}
          onClick={() => handleTabChange("COMPLETED")}
          className={selectedTab === "COMPLETED" ? "" : "text-gray-400"}
        >
          Completed
        </Link>
      </div>
      <div className="tab-content">
        {selectedTab === "WATCHING" ? (
          <List status={selectedTab} />
        ) : selectedTab === "PLAN_TO_WATCH" ? (
          <List status={selectedTab} />
        ) : (
          selectedTab === "COMPLETED" && <List status={selectedTab} />
        )}
      </div>
    </div>
  );
};
export default Lists;
