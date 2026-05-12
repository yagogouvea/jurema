import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

/** Umami só carrega se VITE_ANALYTICS_ENDPOINT e VITE_ANALYTICS_WEBSITE_ID estiverem definidos no build. */
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID as string | undefined;
if (analyticsEndpoint?.trim() && analyticsWebsiteId?.trim()) {
  const base = analyticsEndpoint.replace(/\/$/, "");
  const s = document.createElement("script");
  s.defer = true;
  s.src = `${base}/umami`;
  s.dataset.websiteId = analyticsWebsiteId;
  document.body.appendChild(s);
}

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Em /pdv/* usar só pdv_token; admin_token no mesmo origin quebraria o JWT do PDV nas rotas pdv.*.
        const path = typeof window !== "undefined" ? window.location.pathname : "";
        const isPdv = path.startsWith("/pdv");
        const pdvToken = localStorage.getItem("pdv_token");
        const adminToken = localStorage.getItem("admin_token");
        if (isPdv) {
          if (pdvToken) return { Authorization: `Bearer ${pdvToken}` };
          return {};
        }
        if (adminToken) return { Authorization: `Bearer ${adminToken}` };
        if (pdvToken) return { Authorization: `Bearer ${pdvToken}` };
        return {};
      },
      fetch(input, init) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
