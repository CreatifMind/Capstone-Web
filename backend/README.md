# PurityLoop AI Backend

FastAPI backend for PurityLoop AI persistence and video-processing support. Browser image inference uses the ONNX model served by the frontend at `/models/purityloop/best.onnx`; verified detections are then saved through this backend.

## Files

```text
backend/
├── main.py
├── requirements.txt
├── .env.example
└── models/
    └── best.pt  # legacy PyTorch backend model, not used by browser image inference
```

## Requirements

- Python 3.10 or newer
- FFmpeg and FFprobe available on `PATH` for browser-compatible annotated MP4 output
- Supabase project with the expected scan result tables
- Browser ONNX model served by the frontend at `public/models/purityloop/best.onnx`

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
ALLOWED_ORIGINS=http://localhost:3000,https://purityloop-ai.vercel.app
SUPABASE_STORAGE_BUCKET=mock_uploaded_images
SUPABASE_STORAGE_PRIVATE=false
GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID=1oLPhVOBqflPjzQ6wQFq2FVZEj35PFhVd
GOOGLE_OAUTH_CLIENT_SECRET_FILE=backend/google-oauth-client.json
GOOGLE_OAUTH_TOKEN_FILE=backend/google-oauth-token.json
GOOGLE_OAUTH_REDIRECT_URI=https://your-fastapi-backend.example.com/api/google/callback
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Do not expose it in frontend code.

`SUPABASE_STORAGE_PRIVATE=true` makes annotated MP4 URLs signed by the backend. Keep it `false` only when the bucket is intentionally public.

For the deployed frontend, set Vercel `NEXT_PUBLIC_API_BASE_URL` to:

```text
https://your-fastapi-backend.example.com
```

Use the current FastAPI backend base URL only. Do not include `/docs`; `/docs` is only the Swagger UI page. Do not point this at Vercel unless Vercel is only proxying to a separate long-running FastAPI service.

## Run Locally

From the repository root:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

The health response includes safe diagnostics for browser ONNX model availability, FFmpeg/FFprobe availability, Supabase configuration, and the storage bucket. It does not print secret values.

## API

### `GET /api/health`

Returns backend status and the resolved browser ONNX model path.

Example response:

```json
{
  "ok": true,
  "model_engine": "browser-onnx",
  "model_path": "/absolute/path/public/models/purityloop/best.onnx"
}
```

### `POST /api/predict` legacy endpoint

Accepts one image upload using multipart form data for the legacy PyTorch backend path. The current web upload flow uses browser ONNX detection and saves verified detections through `/api/scans/browser-detected`.

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/predict \
  -F "file=@sample.jpg"
```

### Annotated MP4 video scans

MP4 video uploads are queued through `/api/uploads/start`, `/api/uploads/{upload_id}`, and `/api/ingest`.
`/api/uploads/start` only validates the MP4 request and creates the Google Drive source-upload session. It does not create annotated-output storage, run YOLO, initialize OpenCV, or check FFmpeg.

During the existing sequential YOLOv8 tracking pass, the backend writes an annotated intermediate video frame by frame, then encodes the final browser-compatible MP4 with:

```bash
ffmpeg -y -i <intermediate.mp4> -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart <result.mp4>
```

The generated file is validated with `ffprobe` and uploaded with `Content-Type: video/mp4` to:

```text
annotated-videos/{scanId}/result.mp4
```

Annotated MP4 metadata is persisted in the video tracking summary:

```text
annotated_video_url
annotated_video_storage_path
annotated_video_status
annotated_video_error
```

FFprobe compatibility details are logged during processing, but only URL/path/status/error metadata is persisted with the scan.

If FFmpeg, FFprobe, encoding, validation, or upload fails, the scan and frame/object results are still preserved and `annotated_video_status` becomes `failed`.

## Backend Deployment

The frontend on Vercel only hosts the Next.js UI. Keep YOLO/FFmpeg video inference in this FastAPI backend on a host that supports long-running Python processes, large uploads, local job-scoped temporary files, the bundled model file, and FFmpeg.

Use the backend Dockerfile for the selected Python host so FFmpeg is reliably available:

```text
Root Directory: backend
Environment: Docker / long-running Python service
Port: 7860
Start command: built into Dockerfile
```

Required backend environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
SUPABASE_STORAGE_PRIVATE
VIDEO_WORK_ROOT
DEFAULT_VIDEO_FPS
MAX_VIDEO_UPLOAD_BYTES
MODEL_PATH only if legacy `/api/predict` or backend PyTorch video inference is intentionally enabled
MODEL_VERSION
ALLOWED_ORIGINS
GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID
GOOGLE_OAUTH_CLIENT_SECRET_FILE
GOOGLE_OAUTH_TOKEN_FILE
GOOGLE_OAUTH_REDIRECT_URI
```

Do not commit real secret values.

## Vercel Staging

Set the frontend environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-fastapi-backend.example.com
```

Redeploy Vercel after changing the value.

## Video Smoke Test

1. Upload an MP4 from the Upload page.
2. Wait for `/api/jobs/{job_id}` to return `completed`.
3. Retrieve the first scan with `/api/scans/{scan_id}`.
4. Confirm `annotated_video_status` is `ready` and `annotated_video_url` is present.
5. Open `/review?scanId={scan_id}`.
6. Play the “Annotated Result Video”.
7. Confirm frame/crop result images still render below the video panel.

Example response:

```json
{
  "scan_result_id": "uuid",
  "overall_status": "accepted",
  "contamination_risk": "low",
  "recommended_action": "Accept scan after operator verification.",
  "human_review_required": false,
  "overall_confidence": 0.94,
  "detected_materials": [
    {
      "category": "battery",
      "confidence": 0.98,
      "material_class": "contaminant",
      "decision_status": "confirmed",
      "review_required": false,
      "display_status": "Confirmed Contaminant",
      "disposal_route": "Battery / E-Waste Collection"
    }
  ]
}
```

## Supabase Tables

The backend currently writes to:

- `scan_results`
- `detected_materials`

Apply or verify the database schema from:

```text
supabase/schema.sql
```

## Notes

- CORS is configured from `ALLOWED_ORIGINS`.
- Only image uploads are accepted by `/api/predict`.
- The YOLO model is loaded lazily on the first prediction request.
- Browser image inference does not require `backend/models/best.pt`; it requires `/models/purityloop/best.onnx` to be served by the frontend.
