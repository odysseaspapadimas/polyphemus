import { Center, Container, Loader } from "@mantine/core";

export default function Loading() {
  return (
    <Container my={36}>
      <Center>
        <Loader />
      </Center>
    </Container>
  );
}
