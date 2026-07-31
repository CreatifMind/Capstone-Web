# PurityLoop AI Data Source Notes

## Current Stage

- Database schema is prepared only.
- No mock records are inserted.
- Google Drive will store uploaded images or ZIP files later.
- Supabase stores `scan_results` and `detected_materials`.
- Browser image inference loads `best.onnx` from `/models/purityloop/best.onnx`.
- The FastAPI backend is still used for persistence and long-running video processing services.
- Frontend should show empty or pending states until records exist.

## Current Data Source Mode

Use this setup when preparing the real Google Drive + Supabase flow:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_USE_SUPABASE=true
NEXT_PUBLIC_USE_MOCK_DB=false
NEXT_PUBLIC_API_BASE_URL=https://your-fastapi-backend.example.com
```

In this mode:

- Google Drive stores uploaded image or ZIP files.
- Supabase stores structured records only.
- `scan_results` stores Google Drive file references, upload status, processing status, YOLOv8 summary fields, confidence, and human review status.
- `detected_materials` stores the detected objects/materials linked to a `scan_results` row.
- `localStorage` should not be treated as the main database.
- Hardcoded frontend records should not be used as the source of truth in Supabase mode.

## Future Real Flow

```text
User uploads one image from `https://purityloop-ai.vercel.app`
-> frontend sends image to the configured FastAPI backend, for example `${NEXT_PUBLIC_API_BASE_URL}/api/predict`
-> backend creates scan_results row in Supabase
-> browser ONNX inference processes image uploads with `/models/purityloop/best.onnx`
-> backend inserts detected_materials rows
-> frontend reads Supabase records
```

## Frontend Query Expectations

- `/log` should read all rows from `scan_results`.
- `/result?scanId=<id>` should read one `scan_results` row and its linked `detected_materials`.
- `/analytics` should calculate metrics from `scan_results` and `detected_materials`.

## Verification Checklist

1. Create Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Confirm `users` table exists.
4. Confirm `scan_results` table exists.
5. Confirm `detected_materials` table exists.
6. Confirm Google Drive tracking columns exist in `scan_results`.
7. Confirm database starts empty.
8. Set `.env.local` with Supabase URL and anon key.
9. Set Vercel `NEXT_PUBLIC_API_BASE_URL` to the backend base URL without `/docs`.
10. Set backend `ALLOWED_ORIGINS` to the Vercel frontend URL.
11. Restart/redeploy frontend and backend.
12. Confirm frontend can handle empty database without crashing.
13. Confirm `/log` shows empty state.
14. Confirm `/analytics` shows empty state.
15. Confirm `/result` without `scanId` shows no scan selected state.
