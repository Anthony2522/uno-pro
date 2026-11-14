import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Guest } from "./api";
import { toGameError } from "./errors";

const KEY = "unopro.guest.v1";

type Status = "loading" | "needs-name" | "ready";

type GuestCtx = {
  status: Status;
  guest: Guest | null;
  isDev: boolean;
  activateDev: (key:string)=>Promise<void>;
  register: (nickname: string) => Promise<void>;
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
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    const g = readStored();
    if (!g) {
      setStatus("needs-name");
      return;
    }
    setGuest(g);
    setStatus("ready");
    api.devStatus(g.token).then(r=>setIsDev(r.is_dev)).catch(()=>setIsDev(false));
    // Validate in the background; a network failure keeps the stored identity.
    api
      .whoami(g.token)
      .then((w) => {
        if (w.nickname !== g.nickname) {
          const next = { ...g, nickname: w.nickname };
          store(next);
          setGuest(next);
        }
      })
      .catch((e) => {
        if (toGameError(e).code === "INVALID_SESSION") {
          setLastName(g.nickname);
          store(null);
          setGuest(null);
          setStatus("needs-name");
        }
      });
  }, []);

  const register = useCallback(async (nickname: string) => {
    const g = await api.registerGuest(nickname);
    store(g);
    setGuest(g);
    setIsDev(false);
    setStatus("ready");
  }, []);

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
    () => ({ status, guest, register, rename, resetSession, lastName,isDev,activateDev }),
    [status, guest, register, rename, resetSession, lastName,isDev,activateDev],
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