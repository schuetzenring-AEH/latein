import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { StoreProvider } from "./context/Store";
import { AdminPage } from "./pages/AdminPage";
import { QuizPage } from "./pages/QuizPage";
import { SetupPage } from "./pages/SetupPage";
import { StatsPage } from "./pages/StatsPage";

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <BrowserRouter basename={routerBasename}>
          <Layout>
            <Routes>
              <Route path="/" element={<SetupPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/statistik" element={<StatsPage />} />
              <Route path="/woerter" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </StoreProvider>
    </ErrorBoundary>
  );
}
