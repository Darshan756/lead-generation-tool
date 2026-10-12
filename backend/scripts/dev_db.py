"""Run a local PostgreSQL for development without Docker or a system install.

Uses the ``pgserver`` package (bundled PostgreSQL binaries, installed by
requirements-dev.txt). Data is kept in ~/.cache/leads-demo-pgdata.

    python scripts/dev_db.py        # start, print the DATABASE_URL, keep running

If you already have PostgreSQL or Docker, you do not need this script: see the
README and docker-compose.yml.
"""

import time
from pathlib import Path

import pgserver
import psycopg

DATA_DIR = Path.home() / ".cache" / "leads-demo-pgdata"


def main() -> None:
    server = pgserver.get_server(DATA_DIR)
    admin_uri = server.get_uri()
    with psycopg.connect(admin_uri, autocommit=True) as conn:
        for name in ("leads_demo", "leads_demo_test"):
            if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
                conn.execute(f'CREATE DATABASE "{name}"')
    print("PostgreSQL is running. Put this in backend/.env:\n", flush=True)
    print(f"DATABASE_URL={admin_uri.replace('/postgres?', '/leads_demo?')}", flush=True)
    print(f"TEST_DATABASE_URL={admin_uri.replace('/postgres?', '/leads_demo_test?')}", flush=True)
    print("\nPress Ctrl+C to stop.", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.cleanup()


if __name__ == "__main__":
    main()
