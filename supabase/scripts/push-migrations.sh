#!/usr/bin/env bash
#
# Apply pending migrations to the linked Supabase project through the Management
# API SQL endpoint. Unlike `supabase link` + `db push`, this needs no link
# session or database password - only SUPABASE_ACCESS_TOKEN and the project
# reference - and works with access tokens whose scope excludes CLI linking.
#
# The remote schema_migrations table stores the bare timestamp (e.g.
# 20260906143618) for each applied migration, matching the `timestamp_*.sql`
# local files by prefix - the same pairing the Supabase "Preview" check accepts.
set -euo pipefail

PROJECT_ID="${1:-}"
SUPABASE_API="https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query"
RESPONSE_FILE="$(mktemp)"

cleanup() {
  rm -f "${RESPONSE_FILE}"
}
trap cleanup EXIT

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "::error::SUPABASE_ACCESS_TOKEN must be set."
  exit 1
fi
if [ -z "${PROJECT_ID}" ]; then
  echo "::error::SUPABASE_PROJECT_ID must be provided as the first argument."
  exit 1
fi

# Run a SQL statement against the Management API. Successful responses are
# 2xx; anything else surfaces the server error and aborts.
run_sql() {
  local query="$1" payload code
  payload="$(printf '%s' "$query" | python3 -c 'import json, sys; print(json.dumps({"query": sys.stdin.read()}))')"
  code="$(curl -sS -o "${RESPONSE_FILE}" -w '%{http_code}' \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    "${SUPABASE_API}")"
  if [ "${code}" -lt 200 ] || [ "${code}" -ge 300 ]; then
    echo "::error::Management API returned ${code}:"
    cat "${RESPONSE_FILE}"
    exit 1
  fi
}

remote_versions() {
  run_sql "select version from supabase_migrations.schema_migrations order by version"
  python3 -c '
import json, sys
rows = json.load(open(sys.argv[1]))
for r in rows:
    v = r.get("version")
    if isinstance(v, str) and v:
        print(v)
' "${RESPONSE_FILE}"
}

declare -A APPLIED
while IFS= read -r v; do
  [ -n "${v}" ] && APPLIED["${v}"]=1
done < <(remote_versions)

pending=()
for f in supabase/migrations/*.sql; do
  base="$(basename "${f}" ".sql")"
  ts="${base%%_*}"
  if [ -z "${APPLIED[${ts}]+x}" ] && [ -z "${APPLIED[${base}]+x}" ]; then
    pending+=("${f}")
  fi
done

if [ "${#pending[@]}" -eq 0 ]; then
  echo "No pending migrations; the remote database is in sync."
  exit 0
fi

echo "Pending migrations:"
for f in "${pending[@]}"; do
  printf '  %s\n' "$(basename "${f}")"
done
echo "Applying via Management API..."

for file in "${pending[@]}"; do
  base="$(basename "${file}" ".sql")"
  ts="${base%%_*}"
  echo "  -> ${base}"
  run_sql "$(cat "${file}")"
  run_sql "insert into supabase_migrations.schema_migrations (version) values ('${ts}') on conflict do nothing;"
done

echo "Done: ${#pending[@]} migration(s) applied; remote database is in sync."