import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { StoreProvider, useStore } from "./context/Store";
import { AdminPage } from "./pages/AdminPage";
import { GatePage } from "./pages/GatePage";
import { ArenaPage } from "./pages/ArenaPage";
import { PlanetsPage } from "./pages/PlanetsPage";
import { QuizPage } from "./pages/QuizPage";
import { SetupPage } from "./pages/SetupPage";
import { SpacePage } from "./pages/SpacePage";
import { StatsPage } from "./pages/StatsPage";

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function AppRoutes() {
  const { playMode } = useStore();
  if (playMode === "gate") return <GatePage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/weltraum" element={<SpacePage />} />
        <Route path="/planeten" element={playMode === "named" ? <PlanetsPage /> : <Navigate to="/" replace />} />
        <Route path="/arena" element={playMode === "named" ? <ArenaPage /> : <Navigate to="/" replace />} />
        <Route path="/statistik" element={<StatsPage />} />
        <Route path="/woerter" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <BrowserRouter basename={routerBasename}>
          <AppRoutes />
        </BrowserRouter>
      </StoreProvider>
    </ErrorBoundary>
  );
}
