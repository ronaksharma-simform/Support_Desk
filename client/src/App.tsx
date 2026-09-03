import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppLayout } from "./components/Layout";
import { RequireAuth, RequireRole } from "./components/guards";
import { AgentsPage } from "./pages/AgentsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { QueuePage } from "./pages/QueuePage";
import { SignupPage } from "./pages/SignupPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

const STAFF = ["support_agent", "admin"];
const ADMINS = ["admin"];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/new" element={<NewTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />

            <Route
              path="/queue"
              element={
                <RequireRole roles={STAFF}>
                  <QueuePage />
                </RequireRole>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireRole roles={STAFF}>
                  <DashboardPage />
                </RequireRole>
              }
            />
            <Route
              path="/agents"
              element={
                <RequireRole roles={ADMINS}>
                  <AgentsPage />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
