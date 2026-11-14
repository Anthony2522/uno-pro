import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, DoorOpen, Plus } from "lucide-react";
import { AppHeader } from "@/components/uno/AppHeader";
import { CreateRoomDialog } from "@/components/uno/CreateRoomDialog";
import { JoinByCode } from "@/components/uno/JoinByCode";
import { PublicRooms } from "@/components/uno/PublicRooms";
import { UnoCard } from "@/components/uno/UnoCard";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/uno/api";
import { useReadyGuest } from "@/lib/uno/guest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNO Pro — jogue UNO online com amigos" },
      { name: "description", content: "Crie uma sala, mande o link e jogue UNO em tempo real com seus amigos. Sem cadastro, direto no navegador." },
      { property: "og:title", content: "UNO Pro — jogue UNO online com amigos" },
      { property: "og:description", content: "Salas em tempo real, sem cadastro. Crie, convide e jogue pelo celular ou computador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { guest } = useReadyGuest();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const roomsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.whoami(guest.token).then((w) => setActiveRoom(w.room_code)).catch(() => {});
  }, [guest.token]);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-glass-border bg-felt px-5 py-8 sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 md:block" aria-hidden>
            <div className="relative h-56 w-72">
              <UnoCard card="W4" size="lg" rotate={-16} className="absolute left-0 top-6 animate-float [--rot:-16deg]" />
              <UnoCard card="bR" size="lg" rotate={2} className="absolute left-20 top-0 animate-float [--rot:2deg] [animation-delay:0.8s]" />
              <UnoCard card="r7" size="lg" rotate={18} className="absolute left-40 top-8 animate-float [--rot:18deg] [animation-delay:1.6s]" />
            </div>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Bem-vindo de volta</p>
          <h1 className="mt-2 max-w-xl text-3xl font-black leading-tight sm:text-5xl">
            Bora jogar, <span className="text-gradient">{guest.nickname}</span>?
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">Crie uma sala e mande o link, ou entre numa sala aberta. Tudo em tempo real.</p>
          <div className="mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
            <Button variant="hero" size="xl" onClick={() => setCreateOpen(true)}>
              <Plus /> Criar sala
            </Button>
            <Button
              variant="glass"
              size="xl"
              onClick={() => {
                roomsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                setTimeout(() => codeRef.current?.focus({ preventScroll: true }), 350);
              }}
            >
              <DoorOpen /> Entrar em uma sala
            </Button>
          </div>
          {activeRoom && (
            <Link
              to="/sala/$code"
              params={{ code: activeRoom }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-4 py-2 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/20"
            >
              Você ainda está na sala {activeRoom} — voltar <ArrowRight className="size-4" />
            </Link>
          )}
        </section>

        <div ref={roomsRef} className="mt-8 grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_22rem]">
          <PublicRooms onCreate={() => setCreateOpen(true)} />
          <div className="lg:sticky lg:top-24 lg:self-start">
            <JoinByCode ref={codeRef} />
          </div>
        </div>
      </main>
      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}