import { useCallback, useEffect, useRef, useState } from "react";
import { api, type RoomState } from "./api";
import { GameError, toGameError } from "./errors";
import { useReadyGuest } from "./guest";
import {hasLocalRoom,getRecoverableSoloRoom} from "./offlineRuntime";

export type Connection = "ok" | "reconnecting";

export function useRoom(code: string) {
  const { guest, resetSession } = useReadyGuest();
  const token = guest.token;
  const [state, setState] = useState<RoomState | null>(null);
  const [fatal, setFatal] = useState<GameError | null>(null);
  const [connection, setConnection] = useState<Connection>("ok");
  const reqId = useRef(0);
  const applied = useRef(0);
  const rejoining = useRef(false);
  const leaving = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (leaving.current) return;
    const id = ++reqId.current;
    try {
      const s = await api.getRoomState(token, code);
      if (id < applied.current || leaving.current) return;
      applied.current = id;
      setState(s);
      setConnection("ok");
    } catch (e) {
      const ge = toGameError(e);
      if (ge.code === "NETWORK" || ge.code === "UNKNOWN") {
        setConnection("reconnecting");
        return;
      }
      if (ge.code === "INVALID_SESSION") {
        resetSession();
        return;
      }
      if (ge.code === "NOT_MEMBER" && !rejoining.current) {
        // Removed after a long disconnect: try to come back as the same player.
        rejoining.current = true;
        try {
          await api.joinRoom(token, code);
          rejoining.current = false;
          return refresh();
        } catch (e2) {
          setFatal(toGameError(e2));
          return;
        }
      }
      setFatal(ge);
    }
  }, [token, code, resetSession]);

  // Initial join (idempotent for existing members = reconnection).
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setState(null);
    setFatal(null);
    leaving.current = false;
    const attempt = async () => {
      try {
        await api.joinRoom(token, code);
        if (!cancelled) await refresh();
      } catch (e) {
        if (cancelled) return;
        const ge = toGameError(e);
        if (ge.code === "NETWORK" || ge.code === "UNKNOWN") {
          setConnection("reconnecting");
          retry = setTimeout(attempt, 2500);
        } else if (ge.code === "INVALID_SESSION" && !getRecoverableSoloRoom(code)) {
          resetSession();
        } else {
          setFatal(ge);
        }
      }
    };
    void attempt();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [token, code, refresh, resetSession]);

  const joined = state !== null;

  // Polling = heartbeat + fallback when realtime is unavailable.
  useEffect(() => {
    if (!joined || fatal) return;
    const t = setInterval(() => void refresh(), hasLocalRoom(code)?500:5000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
  }, [joined, fatal, refresh]);

  // Realtime doorbell: the server pushes a data-free "bump" over SSE on any change in the room.
  const roomId = state?.room.id;
  const localOnly=!!state?.room.local_only;
  useEffect(() => {
    if (!roomId || fatal || localOnly) return;
    const es = new EventSource(`/api/events?scope=room&code=${encodeURIComponent(code)}`);
    es.addEventListener("ready", () => void refresh());
    es.addEventListener("bump", () => void refresh());
    return () => {
      es.close();
    };
  }, [roomId, code, fatal, refresh, localOnly]);

  const leave = useCallback(async () => {
    leaving.current = true;
    try {
      await api.leaveRoom(token, code);
    } catch {
      /* the server timeout will clean up */
    }
  }, [token, code]);

  return { state, fatal, connection, refresh, leave, token };
}