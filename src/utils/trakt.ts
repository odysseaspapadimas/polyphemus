import { Trakt } from "better-trakt";

const trakt = new Trakt({
  clientId: process.env.TRAKT_CLIENT_ID!,
  clientSecret: process.env.TRAKT_CLIENT_SECRET,
});

export const test = async () => await trakt.shows.summary({showId: 'foundation-2021'});
