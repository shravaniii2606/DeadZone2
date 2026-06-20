import type { FormEvent } from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const from = state?.from?.pathname || "/map";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email === "user@demo.com" && password === "demo") {
      localStorage.setItem("deadzone-auth", "true");
      navigate(from, { replace: true });
    } else {
      setError("Invalid email or password.");
    }
  }

  return (
    <div className="page-stack narrow">
      <section className="page-hero landing-hero">
        <div className="login-card">
          <div className="landing-brand login-brand">
            <div className="landing-logo">D</div>
            <div>
              <p className="eyebrow">DeadZone</p>
              <h2 className="landing-title">Sign In</h2>
            </div>
          </div>

          <h1>Welcome back</h1>
          <p className="hero-copy">Sign in with your demo account to access the shared signal map and reporting tools.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@demo.com" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo" required />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="primary-button full-width" type="submit">
              Sign In
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
