# 🐢 SERC Wildlife Intake

Web app for [Southeastern Reptile Conservation (SERC)](https://www.southeastreptile.org) volunteers to photograph a paper intake sheet and have patient/rescuer data extracted via OCR, reviewed, and saved to a Google Sheet in WRMD export format.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Front-end | React 19, Material UI v7 |
| Back-end | Python, FastAPI |
| OCR | Google Cloud Vision API |
| Data storage | Google Sheets API |
| Frontend hosting | Firebase Hosting |
| Backend hosting | Google Cloud Run |
| CI/CD | Google Cloud Build |

---

## Project Structure

```
turtle-intake/
├── cloudbuild.yaml            # CI/CD pipeline
├── firebase.json              # Firebase Hosting config
├── frontend/
│   ├── .env.production        # Production API URL
│   └── src/
│       ├── components/
│       │   ├── UploadForm/    # Photo upload
│       │   ├── ReviewForm/    # Review & edit extracted fields
│       │   └── ConfirmDialog/ # Confirm before saving
│       ├── services/api.js    # API client
│       ├── App.jsx
│       └── theme.js
└── backend/
    ├── Dockerfile
    ├── main.py
    ├── routers/intake.py      # POST /api/intake/extract, POST /api/intake/save, GET /api/taxa/search
    ├── services/
    │   ├── ocr.py             # Cloud Vision extraction
    │   ├── sheets.py          # Google Sheets append
    │   └── wrmd.py            # WRMD taxa search
    ├── models/intake.py
    └── requirements.txt
```

---

## Local Development

### Prerequisites

- Node.js 22+, Python 3.11+
- GCP project with Cloud Vision API and Sheets API enabled
- Google Service Account JSON key with access to both APIs and the target spreadsheet

### Front-End

```bash
cd frontend
npm install
# Create frontend/.env:
# REACT_APP_API_BASE_URL=http://localhost:8000
npm start   # http://localhost:3000
```

### Back-End

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Create backend/.env from backend/.env.example
uvicorn main:app --reload --port 8000
```

---

## Environment Variables

### Back-End (`backend/.env`)

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Local: path to service account JSON. Cloud Run: raw JSON contents from Secret Manager. |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID (from the sheet URL) |
| `GOOGLE_SHEET_TAB` | Sheet tab name (default: `daily-exams.csv`) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origins |
| `WRMD_API_KEY` | WRMD API token for taxa name validation |

### Front-End (`frontend/.env`)

| Variable | Description |
|---|---|
| `REACT_APP_API_BASE_URL` | FastAPI back-end URL |

---

## API

| Endpoint | Description |
|---|---|
| `POST /api/intake/extract` | Upload intake form photo (multipart, `image` field, max 15 MB). Returns `{ extracted, warnings, taxa_candidates }`. |
| `POST /api/intake/save` | Save reviewed `IntakeRecord` JSON to Google Sheets. |
| `GET /api/taxa/search?q=` | Search WRMD species names. Returns `[{ value, label }]`. |
| `GET /health` | Health check. |

---

## Deployment

Backend → Cloud Run, frontend → Firebase Hosting, both via Cloud Build.

### 1. Store secrets in Secret Manager

```bash
gcloud secrets create GOOGLE_SERVICE_ACCOUNT_JSON --data-file=path/to/service-account.json
echo -n "your_sheet_id"            | gcloud secrets create GOOGLE_SHEET_ID --data-file=-
echo -n "https://your-app.web.app" | gcloud secrets create FRONTEND_ORIGIN --data-file=-
echo -n "your_wrmd_api_key"        | gcloud secrets create WRMD_API_KEY --data-file=-
# firebase login:ci → paste the token:
echo -n "your_firebase_ci_token"   | gcloud secrets create FIREBASE_TOKEN --data-file=-
```

### 2. Grant Cloud Build IAM roles

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" --role=roles/run.admin
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:${CB_SA}" --role=roles/iam.serviceAccountUser
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" --role=roles/firebasehosting.admin
```

### 3. Deploy

The Cloud Run URL isn't known until after the first deploy — do a two-pass bootstrap:

```bash
# Pass 1 — get the Cloud Run URL
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-east4,_SERVICE_NAME=serc-intake-api,\
_API_URL=https://placeholder.example.com,_FIREBASE_PROJECT=serc-turtle-intake

# Get the assigned URL
gcloud run services describe serc-intake-api --region=us-east4 --format='value(status.url)'

# Pass 2 — full deploy with the real URL
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-east4,_SERVICE_NAME=serc-intake-api,\
_API_URL=https://serc-intake-api-abc123-ue.a.run.app,_FIREBASE_PROJECT=serc-turtle-intake
```
