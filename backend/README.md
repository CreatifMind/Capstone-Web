# PurityLoop AI Backend

FastAPI backend for PurityLoop AI image classification. It accepts an uploaded waste image, runs YOLO inference with the bundled model, summarizes contamination risk, and stores scan results in Supabase.

## Files

```text
backend/
├── main.py
├── requirements.txt
├── .env.example
└── models/
    └── best.pt
```

## Requirements

- Python 3.10 or newer
- Supabase project with the expected scan result tables
- YOLO model file at `backend/models/best.pt`

Install Python dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

Required values:

```text
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
MODEL_PATH=backend/models/best.pt
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Do not expose it in frontend code.

## Run Locally

From the repository root:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

## API

### `GET /api/health`

Returns backend status and the resolved model path.

Example response:

```json
{
  "ok": true,
  "model_path": "/absolute/path/backend/models/best.pt"
}
```

### `POST /api/predict`

Accepts one image upload using multipart form data.

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/predict \
  -F "file=@sample.jpg"
```

Example response:

```json
{
  "scan_result_id": "uuid",
  "overall_status": "accepted",
  "contamination_risk": "low",
  "recommended_action": "Accept scan after operator verification.",
  "human_review_required": false,
  "overall_confidence": 0.94,
  "detected_materials": []
}
```

## Supabase Tables

The backend currently writes to:

- `mock_scan_results`
- `mock_detected_materials`

Apply or verify the database schema from:

```text
supabase/schema.sql
```

## Notes

- CORS is currently configured for `http://localhost:3000`.
- Only image uploads are accepted by `/api/predict`.
- The YOLO model is loaded lazily on the first prediction request.
- If `backend/models/best.pt` is missing, prediction returns a server error.
