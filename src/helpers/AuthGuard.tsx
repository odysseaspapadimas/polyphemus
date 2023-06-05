import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { Center, Loader } from "@mantine/core";

export default function AuthGuard({ children }: { children: JSX.Element }) {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      // The user is not authenticated, handle it here.
      router.push("/?signin"); //add ?signin
    },
  });

  const loading = status === "loading";

  /* show loading indicator while the auth provider is still loading */
  if (loading) {
    return (
      <Center my={36}>
        <Loader size="xl" className="" variant="dots" />
      </Center>
    );
  }

  // if auth initialized with a valid user show protected page
  if (!loading && session) {
    return <>{children}</>;
  }

  /* otherwise don't return anything, will do a redirect from useEffect */
  return null;
}
