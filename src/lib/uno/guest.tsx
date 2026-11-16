import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Guest } from "./api";
import { toGameError } from "./errors";
import {getRecoverableSoloRoom,getLocalMatch,getSoloServerBackup} from "./offlineRuntime";

const KEY = "unopro.guest.v1";

type Status = "loading" | "needs-name" | "ready";

type GuestCtx = {
  status: Status;
  guest: Guest | null;
  isDev: boolean;
  activateDev: (key:string)=>Promise<void>;
  register: (nickname: string) => Promise<void>;
  authenticateGoogle: (credential:string) => Promise<void>;
  rename: (nickname: string) => Promise<void>;
  /** Call when the server says the session is invalid. */
  resetSession: () => void;
};

const Ctx = createContext<GuestCtx | null>(null);

function readStored(): Guest | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Guest;
    if (g && typeof g.token === "string" && g.token.length >= 32 && g.guest_id && g.nickname) return g;
  } catch {
    /* ignore */
  }
  return null;
}

function store(g: Guest | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [isDev,setIsDev]=useState(false);
  const [guest, setGuest] = useState<Guest | null>(null);
  const activeToken=useRef<string|null>(null);
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    const g = readStored();
    if (!g) {
      setStatus("needs-name");
      return;
    }
    activeToken.current=g.token;
    setGuest(g);
    setStatus("ready");
    api.devStatus(g.token).then(r=>setIsDev(r.is_dev)).catch(()=>setIsDev(false));
    // Validate in the background; a network failure keeps the stored identity.
    api
      .whoami(g.token)
      .then((w) => {
        if(activeToken.current!==g.token)return;
        if (w.nickname !== g.nickname || w.google_linked!==g.google_linked) {
          const next = { ...g, nickname: w.nickname,google_linked:w.google_linked };
          store(next);
          setGuest(next);
        }
      })
      .catch((e) => {
        if(toGameError(e).code==="INVALID_SESSION"&&activeToken.current===g.token){
          // The server rebooted. Retain the nickname and browser-local match;
          // silently get a new online token without discarding offline backups.
          if(getLocalMatch()?.playing||getSoloServerBackup()){
            // The solo backup keeps its original token and can be resumed offline.
            return;
          }
          void api.registerGuest(g.nickname).then(next=>{
            if(activeToken.current!==g.token)return;
            activeToken.current=next.token;
            store(next);setGuest(next);setIsDev(false);
          }).catch(()=>{/* keep identity until the server is back */});
        }
      });
  }, []);

  const register = useCallback(async (nickname: string) => {
    const g = await api.registerGuest(nickname);
    activeToken.current=g.token;
    store(g);
    setGuest(g);
    setIsDev(false);
    setStatus("ready");
  }, []);

  const authenticateGoogle = useCallback(async (credential:string) => {
    const g=await api.googleLogin(credential,guest?.token);
    activeToken.current=g.token;
    store(g);
    setGuest(g);
    setIsDev(false);
    setStatus("ready");
  },[guest?.token]);

  const rename = useCallback(
    async (nickname: string) => {
      if (!guest) return;
      const r = await api.updateNickname(guest.token, nickname);
      const next = { ...guest, nickname: r.nickname };
      store(next);
      setGuest(next);
      if(next.nickname.toLocaleLowerCase("pt-BR")!=="toninho")setIsDev(false);
    },
    [guest],
  );

  const resetSession = useCallback(() => {
    activeToken.current=null;
    setLastName((n) => guest?.nickname ?? n);
    store(null);
    setGuest(null);
    setIsDev(false);
    setStatus("needs-name");
  }, [guest]);

  const activateDev=useCallback(async (key:string)=>{
    if(!guest)throw Error("INVALID_SESSION");
    await api.devAuth(guest.token,key);setIsDev(true);
  },[guest]);
  const value = useMemo(
    () => ({ status, guest, register, authenticateGoogle, rename, resetSession, lastName,isDev,activateDev }),
    [status, guest, register, authenticateGoogle, rename, resetSession, lastName,isDev,activateDev],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuest() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGuest must be used inside GuestProvider");
  return c as GuestCtx & { lastName: string };
}

/** Same as useGuest but asserts a ready guest (use under the nickname gate). */
export function useReadyGuest() {
  const c = useGuest();
  if (!c.guest) throw new Error("Guest not ready");
  return { ...c, guest: c.guest };
}