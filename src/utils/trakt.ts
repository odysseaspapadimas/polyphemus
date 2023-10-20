import { Trakt } from "better-trakt";

export const trakt = new Trakt({
  clientId: process.env.TRAKT_CLIENT_ID!,
  clientSecret: process.env.TRAKT_CLIENT_SECRET,
});