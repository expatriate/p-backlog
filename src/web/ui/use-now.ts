import { useEffect, useState } from "react";
import { HOUR_MS } from "../../core/model/dates";

const REFRESH_INTERVAL_MS = HOUR_MS;

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
