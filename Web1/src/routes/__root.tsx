import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { auth, firebaseReady, missingFirebaseKeys } from "../lib/firebase";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

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
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Energy" },
      {
        name: "description",
        content: "Real-time monitoring and control for connected electrical assets, energy use and costs.",
      },
      { name: "author", content: "Smart Energy" },
      { property: "og:title", content: "Smart Energy" },
      {
        property: "og:description",
        content: "Real-time monitoring and control for connected electrical assets, energy use and costs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<"loading" | "guest" | "ready">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setAuthState("guest");
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthState(nextUser ? "ready" : "guest");
    });
  }, []);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;

    try {
      setSubmitting(true);
      setError(null);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (signinError) {
      setError(signinError instanceof Error ? signinError.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!firebaseReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Configuration required</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Add Firebase keys to Web1/.env</h1>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {missingFirebaseKeys.map((key) => (
              <li key={key}>• {key}</li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-sm text-muted-foreground">Loading Firebase session…</div>
      </main>
    );
  }

  if (authState === "guest") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">HydraNet</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Sign in to the operations dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use your Firebase admin account to load the live device data.</p>

          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-0 placeholder:text-muted-foreground"
                placeholder="admin@company.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-0 placeholder:text-muted-foreground"
                placeholder="••••••••"
                required
              />
            </label>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative">
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <div className="fixed right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => auth && signOut(auth)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out {user?.email ? `· ${user.email}` : ""}
          </button>
        </div>
      </div>
    </QueryClientProvider>
  );
}
