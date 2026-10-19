#!/usr/bin/env bash
cd "$(dirname "$0")/.." && { echo "-- generated"; for f in supabase/migrations/*.sql supabase/seed.sql; do echo; echo "-- ===== $f ====="; cat $f; done; } > supabase/all-in-one.sql
