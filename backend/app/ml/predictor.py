import numpy as np
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from datetime import datetime
import os
import pickle
import threading
import logging

logger = logging.getLogger(__name__)

MODEL_PATH = "app/ml/model.pkl"

class DeadZonePredictor:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.model = XGBClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            eval_metric="logloss",
            random_state=42
        )
        self.network_encoder = LabelEncoder()
        self.network_encoder.fit(["5g", "4g", "3g", "2g", "slow-2g", "unknown"])
        self.trained = False
        self.total_trained_on = 0
        self._X_buffer = []
        self._y_buffer = []
        self.metrics = {}
        self.feature_importance = {}

        if not self._load_model():
            self._train_synthetic()

    @classmethod
    def get(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = DeadZonePredictor()
        return cls._instance

    def _encode_network(self, network_type: str) -> int:
        nt = (network_type or "unknown").lower()
        if nt not in self.network_encoder.classes_:
            nt = "unknown"
        return int(self.network_encoder.transform([nt])[0])

    def _evaluate(self, X_test, y_test):
        """Calculate and store model metrics on test set"""
        y_pred = self.model.predict(X_test)
        self.metrics = {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 3),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 3),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 3),
            "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 3),
            "test_samples": len(y_test),
            "dead_zone_rate": round(float(y_test.mean()), 3),
        }
        feature_names = ["lat", "lng", "hour", "network_type", "downlink", "rtt"]
        self.feature_importance = {
            name: round(float(imp), 4)
            for name, imp in zip(feature_names, self.model.feature_importances_)
        }
        logger.info(f"Model metrics: {self.metrics}")
        logger.info(f"Feature importance: {self.feature_importance}")

    def _train_synthetic(self):
        np.random.seed(42)
        n = 3000

        lats = np.random.uniform(18.89, 19.27, n)
        lngs = np.random.uniform(72.77, 73.00, n)
        hours = np.random.randint(0, 24, n)
        networks = np.random.choice(["5g","4g","4g","4g","3g","2g","slow-2g"], n)
        downlinks = np.random.exponential(10, n)
        rtts = np.random.exponential(50, n)
        network_enc = np.array([self._encode_network(nt) for nt in networks])

        X = np.column_stack([lats, lngs, hours, network_enc, downlinks, rtts])
        y = (
            (downlinks < 1.0) |
            (rtts > 200) |
            ((networks == "slow-2g") & (downlinks < 2)) |
            ((lats > 19.03) & (lats < 19.05) & (lngs > 72.84) & (lngs < 72.87))
        ).astype(int)

        # 80/20 train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        self.model.fit(X_train, y_train)
        self.trained = True
        self.total_trained_on = len(X_train)

        # Evaluate on held-out test set
        self._evaluate(X_test, y_test)
        self._save_model()
        logger.info(f"XGBoost trained on {len(X_train)} samples, tested on {len(X_test)}")

    def learn(self, lat: float, lng: float, network_type: str,
              downlink: float, rtt: float, is_dead_zone: bool):
        try:
            network_enc = self._encode_network(network_type)
            hour = datetime.now().hour
            X_new = np.array([[lat, lng, hour, network_enc, downlink, rtt]])
            y_new = np.array([int(is_dead_zone)])
            self._X_buffer.append(X_new[0])
            self._y_buffer.append(y_new[0])
            if len(self._X_buffer) >= 50:
                self._retrain_with_buffer()
        except Exception as e:
            logger.error(f"Incremental learn failed: {e}")

    def _retrain_with_buffer(self):
        try:
            X_new = np.array(self._X_buffer)
            y_new = np.array(self._y_buffer)

            if len(np.unique(y_new)) > 1:
                X_train, X_test, y_train, y_test = train_test_split(
                    X_new, y_new, test_size=0.2, random_state=42
                )
                self.model.fit(X_train, y_train, xgb_model=self.model.get_booster())
                self._evaluate(X_test, y_test)
            else:
                self.model.fit(X_new, y_new, xgb_model=self.model.get_booster())

            self.total_trained_on += len(self._X_buffer)
            self._X_buffer = []
            self._y_buffer = []
            self._save_model()
            logger.info(f"XGBoost retrained — total: {self.total_trained_on}")
        except Exception as e:
            logger.error(f"Retrain failed: {e}")

    def _save_model(self):
        try:
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            with open(MODEL_PATH, "wb") as f:
                pickle.dump({
                    "model": self.model,
                    "total_trained_on": self.total_trained_on,
                    "metrics": self.metrics,
                    "feature_importance": self.feature_importance,
                }, f)
            logger.info(f"Model saved to {MODEL_PATH}")
        except Exception as e:
            logger.error(f"Save failed: {e}")

    def _load_model(self):
        try:
            if os.path.exists(MODEL_PATH):
                with open(MODEL_PATH, "rb") as f:
                    data = pickle.load(f)
                    self.model = data["model"]
                    self.total_trained_on = data["total_trained_on"]
                    self.metrics = data.get("metrics", {})
                    self.feature_importance = data.get("feature_importance", {})
                    self.trained = True
                    logger.info(f"Model loaded — trained_on: {self.total_trained_on}, metrics: {self.metrics}")
                    return True
        except Exception as e:
            logger.error(f"Load failed: {e}")
        return False

    def predict(self, lat: float, lng: float, network_type: str,
                downlink: float = 5.0, rtt: float = 50.0, hour: int = 12,
                avg_signal: float = None) -> dict:
        try:
            network_enc = self._encode_network(network_type)

            if (downlink <= 5.0 and rtt <= 50.0) and avg_signal is not None:
                if avg_signal >= -70: downlink = 20.0
                elif avg_signal >= -85: downlink = 8.0
                elif avg_signal >= -100: downlink = 2.0
                else: downlink = 0.3
                rtt = max(20, min(500, int((-avg_signal - 70) * 5)))

            X = np.array([[lat, lng, hour, network_enc, downlink, rtt]])
            prob = float(self.model.predict_proba(X)[0][1])
            prediction = int(self.model.predict(X)[0])

            feature_names = ["location_lat", "location_lng", "time_of_day",
                             "network_type", "downlink_speed", "latency"]
            top_factor = feature_names[int(np.argmax(self.model.feature_importances_))]

            return {
                "is_dead_zone": bool(prediction),
                "probability": round(prob, 3),
                "risk_level": "HIGH" if prob > 0.7 else "MEDIUM" if prob > 0.4 else "LOW",
                "confidence": round(float(max(prob, 1 - prob)) * 100, 1),
                "top_factor": top_factor,
                "model": "XGBoost-v1",
                "trained_on": self.total_trained_on,
            }
        except Exception as e:
            return {
                "is_dead_zone": False, "probability": 0.0,
                "risk_level": "UNKNOWN", "confidence": 0.0,
                "top_factor": "error", "model": "XGBoost-v1",
                "trained_on": self.total_trained_on, "error": str(e)
            }