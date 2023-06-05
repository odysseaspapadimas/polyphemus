import { Button, Modal, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { TRPCClientError } from "@trpc/client";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { AppRouter } from "src/server/api/root";
import { api } from "src/utils/api";

export function isTRPCClientError(
  cause: unknown
): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

const SignupModal = () => {
  const addUsername = api.user.addUsername.useMutation();
  const { update: updateSession } = useSession();

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

  type FormValues = typeof form.values;

  const handleSubmit = async (values: FormValues) => {
    form.validate();
    console.log(values);

    try {
      await addUsername.mutateAsync({ username: values.username });
    } catch (cause) {
      if (isTRPCClientError(cause)) {
        console.log(cause.message, "cause.data");
        form.setFieldError("username", cause.message);
      }
    }

    updateSession();

    // const res1 = await fetch(`api/user?username=${values.username}`);
    // const data1 = await res1.json();
    // if (data1.user?.username === values.username) {
    //   form.setFieldError("username", "Username already exists");
    //   return;
    // }

    // const res = await fetch("/api/user/createUser", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     email: session?.user?.email,
    //     username: values.username,
    //     createdAt: new Date(),
    //     image_url: session?.user?.image
    //   }),
    // });

    // const data = await res.json();

    // if (data.success) {
    //   setLoading(false);
    //   // mutate("/api/user/userExists?email=" + session?.user?.email);
    //   // mutate("/api/user?email=" + session?.user?.email);
    // }
  };
  const [opened, setOpened] = useState(true);

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      title="Welcome! Choose a username"
    >
      <form
        onSubmit={form.onSubmit(handleSubmit)}
        className="flex flex-col space-y-2"
      >
        <TextInput
          placeholder="Username e.g. luffy02"
          {...form.getInputProps("username")}
        />
        <Button
          loading={addUsername.isLoading}
          loaderPosition="center"
          type="submit"
          className="bg-primary self-center"
        >
          Submit
        </Button>
      </form>
    </Modal>
  );
};
export default SignupModal;
