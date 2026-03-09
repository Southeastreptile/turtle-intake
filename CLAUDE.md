# CLAUDE.md — SERC Wildlife Intake

Volunteers photograph a paper intake sheet, upload it, and the app extracts fields and appends the record to a Google Sheet in WRMD export format.

- **Frontend (live):** https://serc-turtle-intake.web.app
- **Backend (live):** https://serc-intake-api-4d3j3nugya-uk.a.run.app
- Keep git commit messages brief.

---

## File Map

```
turtle-intake/
├── cloudbuild.yaml            # CI/CD (Cloud Build) — also see .github/workflows/deploy.yml
├── firebase.json
├── frontend/
│   ├── .env.production        # production API URL
│   └── src/
│       ├── assets/logo.png
│       ├── components/
│       │   ├── UploadForm/    # photo upload + size validation
│       │   ├── ReviewForm/    # edit extracted fields, WRMD Autocomplete
│       │   └── ConfirmDialog/ # final save confirmation
│       ├── services/api.js    # axios wrappers
│       ├── theme.js           # MUI theme (SERC earth tones)
│       └── App.jsx            # step flow: upload → review → confirm → success
└── backend/
    ├── Dockerfile
    ├── main.py                # FastAPI app, CORS, router mount
    ├── routers/intake.py      # POST /api/intake/extract, POST /api/intake/save, GET /api/taxa/search
    ├── services/
    │   ├── ocr.py             # Cloud Vision → IntakeRecord
    │   ├── sheets.py          # gspread append (74 cols, OVERWRITE mode)
    │   └── wrmd.py            # WRMD species name search
    ├── models/intake.py       # IntakeRecord, IntakeResponse, TaxaCandidate
    ├── utils/dates.py         # MM/DD/YY → YYYY-MM-DD
    └── requirements.txt
```

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Path to SA JSON (local) or raw JSON contents (Cloud Run) |
| `GOOGLE_SHEET_ID` | `1qQHxC6XYYvXPdGIAd6dgBwpPKtfraOwNkstFao4kIb8` |
| `GOOGLE_SHEET_TAB` | `daily-exams.csv` |
| `GOOGLE_CLOUD_PROJECT` | `turtle-intake` |
| `FRONTEND_ORIGIN` | Allowed CORS origins |
| `WRMD_API_KEY` | From wrmd.org → account settings → API tokens |

### Frontend (`frontend/.env`)
```
REACT_APP_API_BASE_URL=http://localhost:8000
```

---

## Running Locally

```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm start   # http://localhost:3000
```

---

## Conventions

- React: functional components + hooks only; MUI `sx`/`styled()` for styling
- Python: FastAPI, pydantic models for all I/O, type hints everywhere, PEP 8
- Secrets in `.env` only — never hard-coded; `.env` is gitignored

---

## Critical Gotchas

- **Sheets append:** use `insert_data_option="OVERWRITE"` — `INSERT_ROWS` pushes the header row down
- **Cloud Build image tags:** use `$BUILD_ID`, not `$COMMIT_SHA` — `$COMMIT_SHA` is empty on `gcloud builds submit`
- **Sheets row:** 74 columns total; `wrmd_processed` (col 74) always `"0"` on new rows; `disposition` (col 19) always `"Pending"`
- **WRMD errors** must never block intake — `search_taxa()` returns `[]` on any failure
