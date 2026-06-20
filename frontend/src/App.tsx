import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import MapPage from "./pages/MapPage";
import StatsPage from "./pages/StatsPage";
import ReportPage from "./pages/ReportPage";
import RoutePage from "./pages/RoutePage";
import "./index.css";

const navItems = [
  { to: "/", label: "Map", icon: "🗺️" },
  { to: "/stats", label: "Stats", icon: "📡" },
  { to: "/report", label: "Report", icon: "📊" },
  { to: "/route", label: "Route", icon: "🛣️" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen" style={{ background: "#0a0f0a" }}>
        {/* Top Nav */}
        <nav
          style={{
            background: "rgba(5,10,5,0.95)",
            borderBottom: "1px solid rgba(34,197,94,0.15)",
            backdropFilter: "blur(12px)",
          }}
          className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                boxShadow: "0 0 15px rgba(34,197,94,0.4)",
              }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
            >
              D
            </div>
            <div>
              <p className="text-white font-black text-lg leading-none">DeadZone</p>
              <p style={{ color: "#22c55e" }} className="text-xs font-bold uppercase tracking-widest">
                Signal Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                style={({ isActive }) => ({
                  background: isActive ? "rgba(34,197,94,0.15)" : "transparent",
                  border: isActive ? "1px solid rgba(34,197,94,0.4)" : "1px solid transparent",
                  color: isActive ? "#ffffff" : "#a3b899",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                })}
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Page Content */}
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/route" element={<RoutePage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer
          style={{ borderTop: "1px solid rgba(34,197,94,0.1)", color: "#6b7f65" }}
          className="text-center text-xs py-4"
        >
          DeadZone · Crowdsourced Telecom Intelligence · Team Trevana
        </footer>
      </div>
    </BrowserRouter>
  );
}