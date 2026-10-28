import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "./store";
import { logout } from "./store/authSlice";
import { disconnectSocket } from "./hooks/useProjectSocket";
import AuthPage from "./pages/AuthPage";
import ProjectList from "./pages/ProjectList";
import NewProject from "./pages/NewProject";
import ProjectDashboard from "./pages/ProjectDashboard";
import AdminPanel from "./pages/AdminPanel";
import { initials } from "./components/projectStage";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Nav() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!user) return null;

  // A project's own page still counts as "Projects"; only the brief form is "New project".
  const current = pathname === "/projects/new" ? "new" : pathname.startsWith("/admin") ? "admin" : "projects";
  const tab = (name: string) => (current === name ? { className: "ap-tab on", "aria-current": "page" as const } : { className: "ap-tab" });
  return (
    <>
      {/* The sign-in page's glow, turned down so content stays readable. */}
      <div className="ap-bg" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><b /></div>
      <nav className="ap-nav">
        <div className="ap-nav-in">
          <Link to="/projects" className="ap-brand">
            <span className="ap-logo" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="14" r="5" /><circle cx="36" cy="14" r="5" /><circle cx="24" cy="36" r="5" />
                <path d="M17 14h14M15 18.5l6.5 13M33 18.5l-6.5 13" />
              </svg>
            </span>
            AI Work Flow
          </Link>
          <div className="ap-tabs">
            <Link to="/projects" {...tab("projects")}>Projects</Link>
            <Link to="/projects/new" {...tab("new")}>New project</Link>
            {user.role === "ADMIN" && <Link to="/admin" {...tab("admin")}>Admin</Link>}
          </div>
          <div className="ap-me">
            <span className="ap-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="ap-me-name">{user.name}<small>{user.role}</small></span>
            <button
              className="ap-signout"
              onClick={() => { disconnectSocket(); dispatch(logout()); navigate("/login"); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="relative z-[1] mx-auto max-w-6xl px-4 py-8">
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
