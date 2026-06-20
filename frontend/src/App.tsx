import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import MapPage from "./pages/MapPage";
import StatsPage from "./pages/StatsPage";
import ReportPage from "./pages/ReportPage";
import RoutePage from "./pages/RoutePage";
import "./index.css";

const navItems = [
  { to: "/map", label: "Coverage Map", shortLabel: "Map", marker: "M" },
  { to: "/stats", label: "Live Logging", shortLabel: "Log", marker: "L" },
  { to: "/report", label: "Area Report", shortLabel: "Report", marker: "A" },
  { to: "/route", label: "Route Planner", shortLabel: "Route", marker: "R" },
];

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const loggedIn = localStorage.getItem("deadzone-auth") === "true";
  if (!loggedIn) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname === "/" || location.pathname === "/login";

  return (
    <div className="app-shell">
      {!hideNav && (
        <nav className="top-nav" aria-label="Primary navigation">
          <NavLink to="/" className="brand-link" aria-label="DeadZone home">
            <span className="brand-mark">D</span>
            <span>
              <span className="brand-name">DeadZone</span>
              <span className="brand-subtitle">Crowdsourced signal intelligence</span>
            </span>
          </NavLink>

          <div className="nav-links">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}
              >
                <span className="nav-marker" aria-hidden="true">{item.marker}</span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-short-label">{item.shortLabel}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
          <Route path="/stats" element={<RequireAuth><StatsPage /></RequireAuth>} />
          <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />
          <Route path="/route" element={<RequireAuth><RoutePage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        DeadZone - Crowdsourced Telecom Intelligence - Team Trevana
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
