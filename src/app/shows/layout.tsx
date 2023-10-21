"use client";
import { AuthProvider } from "src/components/AuthProvider";

const ShowsLayout = ({ children }: { children: React.ReactNode }) => {
  return <AuthProvider>{children}</AuthProvider>;
};
export default ShowsLayout;
