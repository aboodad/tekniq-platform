#!/usr/bin/env bash
# Applies migrations + seed to a throw-away local Postgres and runs the SQL tests.
# Needs postgres binaries; run as a user allowed to run initdb (use `su postgres -c` as root).
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | head -1)}; D=$(mktemp -d); PORT=${PGPORT:-5544}
[ "$(id -u)" = 0 ] && { chown postgres "$D"; RUN="su postgres -c"; } || RUN="bash -c"
$RUN "$BIN/initdb -D $D >/dev/null && $BIN/pg_ctl -D $D -o '-p $PORT -k /tmp' -l $D/log -w start >/dev/null"
trap "$RUN \"$BIN/pg_ctl -D $D stop -m immediate >/dev/null\" || true; rm -rf $D" EXIT
P="$BIN/psql -h /tmp -p $PORT -v ON_ERROR_STOP=1 -q -d postgres"
for f in test/shim.sql migrations/*.sql seed.sql test/test.sql test/test2.sql; do echo "== $f"; $RUN "$P -f $PWD/$f"; done
echo "DB TESTS OK"
