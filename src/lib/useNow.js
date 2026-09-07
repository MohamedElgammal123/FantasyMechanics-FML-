import { useEffect, useState } from 'react'

// Ticking clock for countdowns. Interval in ms (1000 for HH:MM:SS urgency).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
