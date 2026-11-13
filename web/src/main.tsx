import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ApiRequestError } from "./lib/api";
import { AppShell } from "./pages/AppShell";
import { AuditPage } from "./pages/Audit";
import { GuildLayout } from "./pages/GuildLayout";
import { HomePage } from "./pages/Home";
import { LevelingPage } from "./pages/Leveling";
import { LoggingPage } from "./pages/Logging";
import { ModerationPage } from "./pages/Moderation";
import { OverviewPage } from "./pages/Overview";
import { RolePanelsPage } from "./pages/RolePanels";
import { TicketsPage } from "./pages/Tickets";
import { WelcomePage } from "./pages/Welcome";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="guilds/:guildId" element={<GuildLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="moderation" element={<ModerationPage />} />
              <Route path="logging" element={<LoggingPage />} />
              <Route path="welcome" element={<WelcomePage />} />
              <Route path="role-panels" element={<RolePanelsPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="leveling" element={<LevelingPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
