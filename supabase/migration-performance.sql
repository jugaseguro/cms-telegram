-- MIGRATION: Performance RPCs para CMS Telegram (v2 - FIXED)
-- Se han agregado sobrecargas sin parámetros y SECURITY DEFINER 
-- para evitar errores 400 Bad Request en PostgREST y problemas de RLS.

-- 1. get_ai_costs_summary (Sin Bot ID)
CREATE OR REPLACE FUNCTION get_ai_costs_summary()
RETURNS TABLE (
  total_cost NUMERIC,
  total_tokens BIGINT,
  month_cost NUMERIC,
  month_tokens BIGINT,
  call_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  start_of_month TIMESTAMP WITH TIME ZONE := DATE_TRUNC('month', NOW());
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cost_usd), 0) AS total_cost,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(SUM(CASE WHEN created_at >= start_of_month THEN cost_usd ELSE 0 END), 0) AS month_cost,
    COALESCE(SUM(CASE WHEN created_at >= start_of_month THEN total_tokens ELSE 0 END), 0) AS month_tokens,
    COUNT(*) AS call_count
  FROM public.ai_usage_logs;
END;
$$;

-- 1b. get_ai_costs_summary (Con Bot ID)
CREATE OR REPLACE FUNCTION get_ai_costs_summary(p_bot_id UUID)
RETURNS TABLE (
  total_cost NUMERIC,
  total_tokens BIGINT,
  month_cost NUMERIC,
  month_tokens BIGINT,
  call_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  start_of_month TIMESTAMP WITH TIME ZONE := DATE_TRUNC('month', NOW());
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cost_usd), 0) AS total_cost,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(SUM(CASE WHEN created_at >= start_of_month THEN cost_usd ELSE 0 END), 0) AS month_cost,
    COALESCE(SUM(CASE WHEN created_at >= start_of_month THEN total_tokens ELSE 0 END), 0) AS month_tokens,
    COUNT(*) AS call_count
  FROM public.ai_usage_logs
  WHERE bot_id = p_bot_id;
END;
$$;

-- 2. get_reports_stats (Sin Bot ID)
CREATE OR REPLACE FUNCTION get_reports_stats(p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  total_customers BIGINT,
  new_customers BIGINT,
  total_conversations BIGINT,
  confirmed_transactions BIGINT,
  pending_transactions BIGINT,
  total_transactions BIGINT,
  confirmed_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.customers) AS total_customers,
    (SELECT COUNT(*) FROM public.customers WHERE created_at >= p_start AND created_at <= p_end) AS new_customers,
    (SELECT COUNT(*) FROM public.conversations WHERE created_at >= p_start AND created_at <= p_end) AS total_conversations,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end) AS confirmed_transactions,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'pending' AND created_at >= p_start AND created_at <= p_end) AS pending_transactions,
    (SELECT COUNT(*) FROM public.transactions WHERE created_at >= p_start AND created_at <= p_end) AS total_transactions,
    (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end) AS confirmed_amount;
END;
$$;

-- 2b. get_reports_stats (Con Bot ID)
CREATE OR REPLACE FUNCTION get_reports_stats(p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE, p_bot_id UUID)
RETURNS TABLE (
  total_customers BIGINT,
  new_customers BIGINT,
  total_conversations BIGINT,
  confirmed_transactions BIGINT,
  pending_transactions BIGINT,
  total_transactions BIGINT,
  confirmed_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.customers WHERE bot_id = p_bot_id) AS total_customers,
    (SELECT COUNT(*) FROM public.customers WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS new_customers,
    (SELECT COUNT(*) FROM public.conversations WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS total_conversations,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS confirmed_transactions,
    (SELECT COUNT(*) FROM public.transactions WHERE status = 'pending' AND created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS pending_transactions,
    (SELECT COUNT(*) FROM public.transactions WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS total_transactions,
    (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS confirmed_amount;
END;
$$;

-- 3. get_reports_chart_series (Sin Bot ID)
CREATE OR REPLACE FUNCTION get_reports_chart_series(p_trunc_text TEXT, p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  bucket TIMESTAMP WITH TIME ZONE,
  conversations_count BIGINT,
  transactions_count BIGINT,
  paid_transactions_count BIGINT,
  customers_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  WITH periods AS (
    SELECT generate_series(
      DATE_TRUNC(p_trunc_text, p_start),
      DATE_TRUNC(p_trunc_text, p_end),
      ('1 ' || p_trunc_text)::INTERVAL
    ) AS bucket
  ),
  conv_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c 
    FROM public.conversations 
    WHERE created_at >= p_start AND created_at <= p_end
    GROUP BY 1
  ),
  tx_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS paid_c
    FROM public.transactions 
    WHERE created_at >= p_start AND created_at <= p_end
    GROUP BY 1
  ),
  cust_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c 
    FROM public.customers 
    WHERE created_at >= p_start AND created_at <= p_end
    GROUP BY 1
  )
  SELECT 
    p.bucket,
    COALESCE(ca.c, 0)::BIGINT AS conversations_count,
    COALESCE(ta.c, 0)::BIGINT AS transactions_count,
    COALESCE(ta.paid_c, 0)::BIGINT AS paid_transactions_count,
    COALESCE(cua.c, 0)::BIGINT AS customers_count
  FROM periods p
  LEFT JOIN conv_agg ca ON p.bucket = ca.b
  LEFT JOIN tx_agg ta ON p.bucket = ta.b
  LEFT JOIN cust_agg cua ON p.bucket = cua.b
  ORDER BY p.bucket;
END;
$$;

-- 3b. get_reports_chart_series (Con Bot ID)
CREATE OR REPLACE FUNCTION get_reports_chart_series(p_trunc_text TEXT, p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE, p_bot_id UUID)
RETURNS TABLE (
  bucket TIMESTAMP WITH TIME ZONE,
  conversations_count BIGINT,
  transactions_count BIGINT,
  paid_transactions_count BIGINT,
  customers_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  WITH periods AS (
    SELECT generate_series(
      DATE_TRUNC(p_trunc_text, p_start),
      DATE_TRUNC(p_trunc_text, p_end),
      ('1 ' || p_trunc_text)::INTERVAL
    ) AS bucket
  ),
  conv_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c 
    FROM public.conversations 
    WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id
    GROUP BY 1
  ),
  tx_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS paid_c
    FROM public.transactions 
    WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id
    GROUP BY 1
  ),
  cust_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c 
    FROM public.customers 
    WHERE created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id
    GROUP BY 1
  )
  SELECT 
    p.bucket,
    COALESCE(ca.c, 0)::BIGINT AS conversations_count,
    COALESCE(ta.c, 0)::BIGINT AS transactions_count,
    COALESCE(ta.paid_c, 0)::BIGINT AS paid_transactions_count,
    COALESCE(cua.c, 0)::BIGINT AS customers_count
  FROM periods p
  LEFT JOIN conv_agg ca ON p.bucket = ca.b
  LEFT JOIN tx_agg ta ON p.bucket = ta.b
  LEFT JOIN cust_agg cua ON p.bucket = cua.b
  ORDER BY p.bucket;
END;
$$;

-- Grant execute to authenticated users (safe because of SECURITY DEFINER + backend logic)
REVOKE ALL ON FUNCTION get_ai_costs_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_ai_costs_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_ai_costs_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_costs_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
