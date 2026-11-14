import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { NicknameScreen } from "@/components/uno/NicknameScreen";
import { Logo } from "@/components/uno/Logo";
import { GuestProvider, useGuest } from "@/lib/uno/guest";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // SPA build: charset, viewport, fonts and the stylesheet are in index.html.
    meta: [
      { title: "UNO Pro — jogue UNO online com amigos" },
      { name: "description", content: "Jogo de cartas multiplayer em tempo real. Crie uma sala, mande o link e jogue sem cadastro." },
      { name: "theme-color", content: "#080F2C" },
      { property: "og:title", content: "UNO Pro — jogue UNO online com amigos" },
      { property: "og:description", content: "Jogo de cartas multiplayer em tempo real, sem cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      <GuestProvider>
        <GuestGate />
        <Toaster position="top-center" richColors />
      </GuestProvider>
    </QueryClientProvider>
  );
}

function GuestGate() {
  const { status } = useGuest();
  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
        <Logo size="lg" className="animate-pulse" />
      </div>
    );
  }
  if (status === "needs-name") return <NicknameScreen />;
  // Required: nested routes render here.
  return <Outlet />;
}