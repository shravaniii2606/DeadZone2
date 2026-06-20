import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import MapPage from "./pages/MapPage";
import StatsPage from "./pages/StatsPage";
import ReportPage from "./pages/ReportPage";
import RoutePage from "./pages/RoutePage";
import "./index.css";

const navItems = [
  { to: "/", label: "Coverage Map", shortLabel: "Map", marker: "M" },
  { to: "/stats", label: "Live Logging", shortLabel: "Log", marker: "L" },
  { to: "/report", label: "Area Report", shortLabel: "Report", marker: "A" },
  { to: "/route", label: "Route Planner", shortLabel: "Route", marker: "R" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
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
                end={item.to === "/"}
                className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}
              >
                <span className="nav-marker" aria-hidden="true">{item.marker}</span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-short-label">{item.shortLabel}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/route" element={<RoutePage />} />
          </Routes>
        </main>

        <footer className="app-footer">
          DeadZone - Crowdsourced Telecom Intelligence - Team Trevana
        </footer>
      </div>
    </BrowserRouter>
  );
}
