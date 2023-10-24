"use client";

import { Button, Center, Modal, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { api } from "src/trpc/react";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";

const SetUsername = () => {
  const router = useRouter();

  const [opened, { close }] = useDisclosure(true);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: {
      username: "",
    },

    validate: {
      username: (value) => {
        if (
          value.length >= 3 &&
          value.toLowerCase() === value &&
          !/\s/.test(value)
        ) {
          return null;
        } else if (value.length < 3) {
          return "Username should be at least 3 characters long";
        } else if (value.toLowerCase() !== value) {
          return "Username should be in all lowercase";
        } else if (/\s/.test(value)) {
          return "Username should not include spaces";
        }
      },
    },
  });

  const userExistsMut = api.user.exists.useMutation();
  const setUsername = api.user.setUsername.useMutation();

  type FormValues = typeof form.values;

  const handleSubmit = (values: FormValues) => {
    setLoading(true);

    void (async () => {
      const userExists = await userExistsMut.mutateAsync({
        username: values.username,
      });

      if (userExists) {
        form.setFieldError("username", "Username already exists");
        setLoading(false);

        return;
      }

      const successful = await setUsername.mutateAsync({
        username: values.username,
      });

      if (successful) {
        router.refresh();
        setLoading(false);
        notifications.show({
          title: "Welcome!",
          message: `Welcome ${values.username}! 😁`,
        });
        close();
      }
    })();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      withCloseButton={false}
      closeOnEscape={false}
      closeOnClickOutside={false}
      overlayProps={{
        backgroundOpacity: 0.9,
        blur: 2,
      }}
      title="Welcome! Choose a username"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <TextInput
          placeholder="e.g. luffy02"
          {...form.getInputProps("username")}
        />
        <Center>
          <Button type="submit" className="mt-4" loading={loading}>
            Submit
          </Button>
        </Center>
      </form>
    </Modal>
  );
};
export default SetUsername;
