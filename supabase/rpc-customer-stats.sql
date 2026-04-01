-- RPC function to compute per-customer transaction stats server-side
-- instead of fetching 500 transaction rows to the client.
-- Run this in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_customer_stats()
RETURNS TABLE (
  customer_id uuid,
  total_loads bigint,
  confirmed_loads bigint,
  total_amount numeric,
  last_load_date timestamptz
) AS $$
  SELECT
    t.customer_id,
    COUNT(*)::bigint AS total_loads,
    COUNT(*) FILTER (WHERE t.status = 'confirmed')::bigint AS confirmed_loads,
    COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'confirmed'), 0) AS total_amount,
    MAX(t.created_at) FILTER (WHERE t.status = 'confirmed') AS last_load_date
  FROM transactions t
  GROUP BY t.customer_id;
$$ LANGUAGE sql STABLE;
