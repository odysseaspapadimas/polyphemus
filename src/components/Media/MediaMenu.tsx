"use client";

import { Menu, ActionIcon } from "@mantine/core";
import { IconDots, IconEye } from "@tabler/icons-react";

const MediaMenu = () => {
  return (
    <div className="absolute top-2 right-2">
      <Menu>
        <Menu.Target>
          <ActionIcon
            className="hover:bg-dark-hover transition-colors duration-75"
            variant="filled"
          >
            <IconDots />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Add to list</Menu.Label>
          <Menu.Item leftSection={<IconEye size={14} />}>
            Already Watched
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};
export default MediaMenu;
