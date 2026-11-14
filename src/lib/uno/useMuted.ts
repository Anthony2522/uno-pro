import { useCallback, useEffect, useState } from "react";
import { isMuted, setMuted } from "./sound";

export function useMuted(): [boolean, () => void] {
  const [muted, setState] = useState(false);
  useEffect(() => setState(isMuted()), []);
  const toggle = useCallback(() => {
    setState((m) => {
      setMuted(!m);
      return !m;
    });
  }, []);
  return [muted, toggle];
}