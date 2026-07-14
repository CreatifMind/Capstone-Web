alter table mock_scan_results
add column if not exists review_status text,
add column if not exists verified_category text,
add column if not exists reviewed_at timestamp with time zone;
