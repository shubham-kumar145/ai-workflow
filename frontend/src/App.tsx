import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "./store";
import { logout } from "./store/authSlice";
import { disconnectSocket } from "./hooks/useProjectSocket";
import AuthPage from "./pages/AuthPage";
import ProjectList from "./pages/ProjectList";
import NewProject from "./pages/NewProject";
import ProjectDashboard from "./pages/ProjectDashboard";
import AdminPanel from "./pages/AdminPanel";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Nav() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-5">
          <Link to="/projects" className="font-bold text-slate-100">AI Work Flow</Link>
          <Link to="/projects" className="text-sm text-slate-400 hover:text-slate-100">Projects</Link>
          {user.role === "ADMIN" && (
            <Link to="/admin" className="text-sm text-slate-400 hover:text-slate-100">Admin</Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{user.name} · {user.role}</span>
          <button
            className="text-slate-400 hover:text-rose-400"
            onClick={() => { disconnectSocket(); dispatch(logout()); navigate("/login"); }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          {/* One component for both, so switching slides the panel instead of reloading the page. */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/projects" element={<RequireAuth><ProjectList /></RequireAuth>} />
          <Route path="/projects/new" element={<RequireAuth><NewProject /></RequireAuth>} />
          <Route path="/projects/:id" element={<RequireAuth><ProjectDashboard /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminPanel /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
