# 📶 DeadZone
**Crowdsourced Telecom Signal Intelligence for Mumbai**

DeadZone is a Progressive Web App that maps real-world network dead zones using crowdsourced signal data, ML-powered predictions, and telecom analytics — giving users, commuters, and telecom companies ground-truth coverage intelligence instead of self-reported marketing maps.

---

## 🚀 Problem Statement
Jio, Airtel, and Vi's coverage maps are self-reported and biased. People face dropped calls, dead zones in Dharavi, metro stations, tunnels, and campuses with zero warning. DeadZone is ground truth — built by the people who actually experience these dead zones.

---

## ✨ What's Built

### 🗺️ Live Signal Coverage Map
- Crowdsourced signal dots across Mumbai MMR
- Color-coded by signal strength (Excellent → Dead Zone)
- Toggle between Signal view and Network Type view (5G/4G/3G/2G)
- Filter by network type with one click

### 📍 Area Intelligence Report
- Click anywhere on the map → instant area report
- Shows dominant network type, operator, avg signal, dead zone count
- Optimistic UI — loads instantly, ML prediction fills in async

### 🤖 XGBoost ML Dead Zone Prediction
- Trained on 3,000+ Mumbai signal readings
- Features: GPS coordinates, time of day, network type, downlink speed, RTT latency
- **Online learning** — model retrains every 50 new user submissions using warm-start
- Returns risk level (HIGH/MEDIUM/LOW), confidence %, and key contributing factor
- Live XGBoost badge shows training count updating in real time

### 🛣️ Signal-Aware Route Planner
- Compare multiple routes by signal quality score
- Shows dead zone % per route, avg signal, distance, duration
- AI-powered route insight via OpenRouter
- Recommends the best connectivity route automatically

### 📊 Telecom Intelligence Dashboard
- Operator performance comparison (Jio vs Airtel vs Vi vs BSNL)
- Dead zone % per operator
- Top 6 dead zone hotspots with exact coordinates and area names
- Network generation distribution (4G/5G/3G/2G)
- Business intelligence cards for telecom buyers

---

## 🛠️ Tech Stack

**Frontend**
- React + TypeScript + Vite
- Leaflet + React-Leaflet (interactive maps)
- Tailwind CSS
- Progressive Web App (PWA)

**Backend**
- FastAPI (Python)
- XGBoost + scikit-learn (ML)
- PostGIS spatial queries (radius-based area reports)
- OpenRouter / Mistral (AI route insights)
- OpenRouteService (route planning)

**Database**
- Supabase (PostgreSQL + PostGIS)

**Infrastructure**
- Vercel (frontend)
- Render (backend)

---

## 🏗️ System Architecture

1. User opens PWA → GPS + signal logged every 10m of movement
2. FastAPI receives reading → stores in Supabase PostGIS
3. XGBoost predictor learns from new reading (buffered, retrains every 50)
4. Heatmap fetches 10,000+ readings → renders on Leaflet map
5. Area click → PostGIS radius query → ML prediction → instant report
6. Route planner → ORS API → signal scored per waypoint → AI insight

---

## 📱 Pages

- **Map** — Live signal coverage with area reports and ML prediction
- **Route** — Signal-aware route comparison with AI insight  
- **Stats / Telecom Dashboard** — Operator analytics and dead zone intelligence
- **Report** — Submit signal reports manually

---

## 🤖 ML Pipeline
New reading submitted
↓
predictor.learn() called
↓
Added to buffer (X_buffer, y_buffer)
↓
Every 50 readings → _retrain_with_buffer()
↓
XGBoost warm-starts from existing model
↓
total_trained_on counter increments
↓
/api/ml/status reflects updated count

---

## 🌍 Business Model

- **B2B Data Licensing** — Sell aggregated dead zone intelligence to Jio/Airtel/TRAI for tower placement
- **Premium API** — Developers building navigation/delivery apps pay for signal-aware routing
- **Enterprise Dashboard** — Smart city projects and municipal corporations

---

## 👥 Team DOMinators

- Shravani
- Mitanshi
- Lavanya  


---

## 💡 Vision

Network connectivity should be predictable, not uncertain. DeadZone turns every smartphone into a signal sensor — building the most accurate, real-time coverage map of India, one reading at a time.

<img width="2558" height="1600" alt="image" src="https://github.com/user-attachments/assets/b4b044d4-823e-452f-bc6c-064544bfd94f" />
<img width="2560" height="1312" alt="image" src="https://github.com/user-attachments/assets/bcdf1fd4-bc7d-4872-8466-ea8ac2e12fc2" />
<img width="2560" height="1316" alt="image" src="https://github.com/user-attachments/assets/206c17f7-fe6a-4f6c-9731-bcc3a538137f" />
<img width="1992" height="826" alt="image" src="https://github.com/user-attachments/assets/26e3c6b4-2cfc-4e86-8b57-e2c74246e01b" />
<img width="2196" height="948" alt="image" src="https://github.com/user-attachments/assets/2e13b461-d0e8-443b-87a6-4242c2289103" />
<img width="2516" height="1332" alt="image" src="https://github.com/user-attachments/assets/64f1c854-9e13-4ef0-a9dc-e8e065db92ed" />
<img width="2550" height="1288" alt="image" src="https://github.com/user-attachments/assets/25dd1c0b-2491-40bc-91fc-8c9868420262" />
<img width="2556" height="1350" alt="image" src="https://github.com/user-attachments/assets/49147907-436c-4f5e-a418-c53795843dbb" />
<img width="2560" height="1270" alt="image" src="https://github.com/user-attachments/assets/d7213166-7fa4-449f-9786-ab3f9aa0fbaf" />
<img width="2560" height="1308" alt="image" src="https://github.com/user-attachments/assets/faa629a6-535c-4432-80a8-a4935a2af820" />
<img width="2548" height="1344" alt="image" src="https://github.com/user-attachments/assets/64ca2e20-dd58-49d7-9d98-9dda063916db" />
