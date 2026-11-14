import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PublicRoom } from "./api";

export function useLobby() {
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const r = await api.listPublicRooms();
      setRooms(r);
      setOffline(false);
      setUpdatedAt(Date.now());
    } catch {
      setOffline(true);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 8000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", refresh);
    // Live updates: the server pushes a data-free "bump" over SSE; we re-fetch the list.
    const es = new EventSource("/api/events?scope=lobby");
    es.addEventListener("bump", () => void refresh());
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", refresh);
      es.close();
    };
  }, [refresh]);

  return { rooms, offline, updatedAt, refresh };
}