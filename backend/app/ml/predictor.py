import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import threading

class DeadZonePredictor:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.network_encoder = LabelEncoder()
        self.network_encoder.fit(["5g", "4g", "3g", "2g", "slow-2g", "unknown"])
        self.trained = False
        self._train_synthetic()

    @classmethod
    def get(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = DeadZonePredictor()
        return cls._instance

    def _train_synthetic(self):
        """Train on synthetic data matching Mumbai signal patterns"""
        np.random.seed(42)
        n = 3000

        # Features: lat, lng, hour, network_encoded, downlink, rtt, avg_signal, bad_reading_ratio
        lats = np.random.uniform(18.89, 19.27, n)
        lngs = np.random.uniform(72.77, 73.00, n)
        hours = np.random.randint(0, 24, n)
        networks = np.random.choice(["5g","4g","4g","4g","3g","2g","slow-2g"], n)
        downlinks = np.random.exponential(10, n)
        rtts = np.random.exponential(50, n)
        base_signal_by_network = {
            "5g": -66,
            "4g": -76,
            "3g": -91,
            "2g": -104,
            "slow-2g": -113,
        }
        avg_signals = np.array([base_signal_by_network[n] for n in networks], dtype=float)
        avg_signals += np.clip(downlinks * 1.2, 0, 14)
        avg_signals -= np.clip(rtts / 25, 0, 18)
        avg_signals += np.random.normal(0, 5, n)
        avg_signals = np.clip(avg_signals, -120, -55)
        bad_reading_ratios = np.clip(
            ((-95 - avg_signals) / 25) + np.random.normal(0, 0.12, n),
            0,
            1
        )

        network_enc = self.network_encoder.transform(networks)

        X = np.column_stack([
            lats, lngs, hours, network_enc, downlinks, rtts,
            avg_signals, bad_reading_ratios
        ])

        # Dead zone logic: low downlink + high rtt + bad network + observed weak readings
        y = (
            (downlinks < 1.0) |
            (rtts > 200) |
            (avg_signals < -101) |
            (bad_reading_ratios >= 0.5) |
            ((networks == "slow-2g") & (downlinks < 2)) |
            # Known dead zone areas
            ((lats > 19.03) & (lats < 19.05) & (lngs > 72.84) & (lngs < 72.87))  # Dharavi
        ).astype(int)

        self.model.fit(X, y)
        self.trained = True

    def _observed_risk(self, avg_signal: float | None, bad_reading_ratio: float | None) -> tuple[float, str]:
        signal_score = 0.0
        if avg_signal is not None:
            if avg_signal <= -112:
                signal_score = 0.97
            elif avg_signal <= -106:
                signal_score = 0.88
            elif avg_signal <= -100:
                signal_score = 0.74
            elif avg_signal <= -95:
                signal_score = 0.52
            elif avg_signal <= -85:
                signal_score = 0.26
            else:
                signal_score = 0.08

        ratio_score = 0.0
        if bad_reading_ratio is not None:
            ratio = max(0.0, min(float(bad_reading_ratio), 1.0))
            ratio_score = 1 - ((1 - ratio) ** 1.8)

        if ratio_score >= signal_score:
            return ratio_score, "bad_reading_ratio"
        return signal_score, "avg_signal_strength"

    def predict(self, lat: float, lng: float, network_type: str,
                downlink: float = 5.0, rtt: float = 50.0, hour: int = 12,
                avg_signal: float | None = None,
                bad_reading_ratio: float | None = None,
                sample_size: int = 0) -> dict:
        try:
            nt = network_type.lower() if network_type else "unknown"
            if nt not in self.network_encoder.classes_:
                nt = "unknown"

            model_avg_signal = avg_signal if avg_signal is not None else -95.0
            model_bad_ratio = bad_reading_ratio if bad_reading_ratio is not None else 0.0
            network_enc = self.network_encoder.transform([nt])[0]
            X = np.array([[
                lat, lng, hour, network_enc, downlink, rtt,
                model_avg_signal, model_bad_ratio
            ]])

            model_prob = float(self.model.predict_proba(X)[0][1])
            observed_prob, observed_factor = self._observed_risk(avg_signal, bad_reading_ratio)
            prob = max(model_prob, observed_prob)
            prediction = prob >= 0.5

            # Feature importance insight
            importances = self.model.feature_importances_
            feature_names = [
                "location_lat", "location_lng", "time_of_day", "network_type",
                "downlink_speed", "latency", "avg_signal_strength", "bad_reading_ratio"
            ]
            top_factor = feature_names[np.argmax(importances)]
            if observed_prob > model_prob:
                top_factor = observed_factor

            return {
                "is_dead_zone": bool(prediction),
                "probability": round(float(prob), 3),
                "risk_level": "HIGH" if prob > 0.7 else "MEDIUM" if prob > 0.4 else "LOW",
                "confidence": round(float(max(prob, 1 - prob)) * 100, 1),
                "top_factor": top_factor,
                "sample_size": sample_size,
                "model": "RandomForest-v2"
            }
        except Exception as e:
            return {
                "is_dead_zone": False,
                "probability": 0.0,
                "risk_level": "UNKNOWN",
                "confidence": 0.0,
                "top_factor": "error",
                "sample_size": sample_size,
                "model": "RandomForest-v2",
                "error": str(e)
            }
