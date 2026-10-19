"use client";
import { useEffect, useState } from "react";

/** A date/time shown in the viewer's own time zone (the server doesn't know it). */
export default function LocalTime({ ms }: { ms: number }) {
  const fmt = (tz?: string) =>
    new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
  const [text, setText] = useState(() => fmt("UTC"));
  useEffect(() => setText(fmt()), [ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return <time dateTime={new Date(ms).toISOString()}>{text}</time>;
}
