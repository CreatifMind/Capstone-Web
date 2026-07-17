# PurityLoop shared API

The website and external scripts use the same FastAPI routes. Browser clients send a Supabase access token; Python, Node, IoT, CCTV, and conveyor-belt clients send an `X-API-Key` created with `python -m backend.create_api_client`.

```bash
curl -H "X-API-Key: pl_live_REDACTED" \
  "${PURITYLOOP_API_BASE}/api/scans?limit=50"
```

Image scan:

```bash
curl -H "X-API-Key: pl_live_REDACTED" \
  -F "file=@sample.jpg" \
  "${PURITYLOOP_API_BASE}/api/predict"
```

MP4 flow:

1. `POST /api/uploads/start` with `{"filename":"line.mp4","size_bytes":123,"mime":"video/mp4"}`.
2. PUT chunks to the returned Google Drive `upload_url` using `Content-Range`.
3. `POST /api/ingest` with `{"source":"drive_file","ref":"<drive-file-id>","options":{"vid_stride":30}}`.
4. Poll `GET /api/jobs/<job-id>` until `status` is `complete` or `failed`.

Required scopes are `scan:write`, `scan:read`, `job:read`, `review:write`, and `live:read`. CORS only applies to browser JavaScript; a Python or device client can call the API from any network that can reach the configured API base URL. Keep API keys server-side, rotate them, and expose the FastAPI service through a stable HTTPS hostname before production use.
