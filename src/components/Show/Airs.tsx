"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { Skeleton } from "@mantine/core";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const dayNameToNumber: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

type Props = {
  nextEpisodeAirDate: Date;
  airTime:
    | {
        day: string;
        time: string;
        timezone: string;
      }
    | undefined;
};
const Airs = ({ nextEpisodeAirDate, airTime }: Props) => {
  const [nextAirDate, setNextAirDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!airTime?.day || !airTime.time || !airTime.timezone) {
      setNextAirDate(null);
      return;
    }

    console.log(nextEpisodeAirDate, airTime, "airtime");
    const localTimeZone = dayjs.tz.guess(); // Get the local timezone
    const sourceTime = dayjs.tz(airTime.time, "HH:mm", airTime.timezone);

    // Find the number corresponding to the provided day of the week
    const dayNumber = dayNameToNumber[airTime.day]!;

    // Parse the next episode air date in the source timezone
    const sourceDate = dayjs.tz(nextEpisodeAirDate, airTime.timezone);

    // Calculate the difference in days to the provided day of the week
    const daysUntilTargetDay = (dayNumber - sourceDate.day() + 7) % 7;

    // Calculate the target date
    const targetDate = sourceDate.add(daysUntilTargetDay, "day");

    // Combine the target date and time, explicitly specifying your local timezone
    const combinedDateTime = dayjs
      .tz(
        targetDate.format("YYYY-MM-DD") + " " + sourceTime.format("HH:mm"),
        airTime.timezone,
      )
      .tz(localTimeZone);

    setNextAirDate(combinedDateTime.toDate());
  }, [nextEpisodeAirDate, airTime]);

  return nextAirDate ? (
    <div>
      Airs:{" "}
      <span>
        {dayjs(nextAirDate).format("dddd")}s at{" "}
        {dayjs(nextAirDate).format("HH:mm")}
      </span>
    </div>
  ) : nextAirDate !== null ? (
    <Skeleton width={150} height={20} mt={4} />
  ) : null;
};
export default Airs;
