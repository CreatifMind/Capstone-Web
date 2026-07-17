"""Provision one scoped external-client key.

Usage: python -m backend.create_api_client --name sorting-line-01 --scopes scan:write scan:read job:read
The raw key is printed once; only its SHA-256 digest is stored.
"""

import argparse
import hashlib
import os
import secrets

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--scopes", nargs="+", default=["scan:write", "scan:read", "job:read"])
    args = parser.parse_args()

    allowed = {"scan:write", "scan:read", "job:read", "review:write", "live:read"}
    scopes = sorted(set(args.scopes))
    if not set(scopes).issubset(allowed):
        raise SystemExit(f"Unsupported scope. Choose from: {', '.join(sorted(allowed))}")

    url = os.getenv("SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    raw_key = f"pl_live_{secrets.token_urlsafe(32)}"
    client = create_client(url, service_role)
    row = (
        client.table("api_clients")
        .insert({
            "name": args.name,
            "key_prefix": raw_key[:16],
            "key_hash": hashlib.sha256(raw_key.encode()).hexdigest(),
            "scopes": scopes,
        })
        .execute()
    )
    if not row.data:
        raise SystemExit("API client was not created")
    print(f"API key (save now; it will not be shown again): {raw_key}")
    print(f"Client id: {row.data[0]['id']}")
    print(f"Scopes: {', '.join(scopes)}")


if __name__ == "__main__":
    main()
