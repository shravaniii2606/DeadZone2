import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="page-stack narrow">
      <section className="page-hero landing-hero">
        <div>
          <div className="landing-brand">
            <div className="landing-logo">D</div>
            <div>
              <p className="eyebrow">DeadZone</p>
              <h2 className="landing-title">Signal Intelligence</h2>
            </div>
          </div>
          <h1>Find signal dead zones before you travel.</h1>
          <p className="hero-copy">
            DeadZone helps you map community signal readings, analyze coverage areas, and compare route connectivity across Mumbai.
          </p>
          <button className="primary-button launch-button" onClick={() => navigate('/map')}>
            Launch App
          </button>
        </div>
      </section>

      <section className="quick-start landing-quick-start">
        <div className="quick-step">
          <span>1</span>
          <strong>Allow GPS</strong>
          <p>Your browser asks once so DeadZone can place readings accurately.</p>
        </div>
        <div className="quick-step">
          <span>2</span>
          <strong>Start logging</strong>
          <p>A reading is saved now and then every 10 seconds until you stop.</p>
        </div>
        <div className="quick-step">
          <span>3</span>
          <strong>Read the colors</strong>
          <p>Green is strong coverage, red or gray means weak or dead-zone signal.</p>
        </div>
      </section>
    </div>
  );
}
