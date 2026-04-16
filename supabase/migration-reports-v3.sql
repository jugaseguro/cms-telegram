-- MIGRATION: Reports v3 (Include incoming_messages)

DROP FUNCTION IF EXISTS get_reports_stats(timestamp with time zone, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS get_reports_stats(timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS get_reports_chart_series(text, timestamp with time zone, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS get_reports_chart_series(text, timestamp with time zone, timestamp with time zone);

-- get_reports_stats (Sin Bot ID)
CREATE OR REPLACE FUNCTION get_reports_stats(p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  total_customers BIGINT,
  new_customers BIGINT,
  total_conversations BIGINT,
  confirmed_transactions BIGINT,
  pending_transactions BIGINT,
  total_transactions BIGINT,
  confirmed_amount NUMERIC,
  incoming_messages BIGINT
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
    (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end) AS confirmed_amount,
    (SELECT COUNT(*) FROM public.messages WHERE sender_type = 'customer' AND created_at >= p_start AND created_at <= p_end) AS incoming_messages;
END;
$$;

-- get_reports_stats (Con Bot ID)
CREATE OR REPLACE FUNCTION get_reports_stats(p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE, p_bot_id UUID)
RETURNS TABLE (
  total_customers BIGINT,
  new_customers BIGINT,
  total_conversations BIGINT,
  confirmed_transactions BIGINT,
  pending_transactions BIGINT,
  total_transactions BIGINT,
  confirmed_amount NUMERIC,
  incoming_messages BIGINT
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
    (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE status = 'confirmed' AND created_at >= p_start AND created_at <= p_end AND bot_id = p_bot_id) AS confirmed_amount,
    (SELECT COUNT(*) FROM public.messages m JOIN public.conversations c ON m.conversation_id = c.id WHERE m.sender_type = 'customer' AND m.created_at >= p_start AND m.created_at <= p_end AND c.bot_id = p_bot_id) AS incoming_messages;
END;
$$;

-- get_reports_chart_series (Sin Bot ID)
CREATE OR REPLACE FUNCTION get_reports_chart_series(p_trunc_text TEXT, p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  bucket TIMESTAMP WITH TIME ZONE,
  conversations_count BIGINT,
  transactions_count BIGINT,
  paid_transactions_count BIGINT,
  customers_count BIGINT,
  incoming_messages_count BIGINT
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
  ),
  msg_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, created_at) AS b, COUNT(*) AS c
    FROM public.messages
    WHERE sender_type = 'customer' AND created_at >= p_start AND created_at <= p_end
    GROUP BY 1
  )
  SELECT 
    p.bucket,
    COALESCE(ca.c, 0)::BIGINT AS conversations_count,
    COALESCE(ta.c, 0)::BIGINT AS transactions_count,
    COALESCE(ta.paid_c, 0)::BIGINT AS paid_transactions_count,
    COALESCE(cua.c, 0)::BIGINT AS customers_count,
    COALESCE(ma.c, 0)::BIGINT AS incoming_messages_count
  FROM periods p
  LEFT JOIN conv_agg ca ON p.bucket = ca.b
  LEFT JOIN tx_agg ta ON p.bucket = ta.b
  LEFT JOIN cust_agg cua ON p.bucket = cua.b
  LEFT JOIN msg_agg ma ON p.bucket = ma.b
  ORDER BY p.bucket;
END;
$$;

-- get_reports_chart_series (Con Bot ID)
CREATE OR REPLACE FUNCTION get_reports_chart_series(p_trunc_text TEXT, p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE, p_bot_id UUID)
RETURNS TABLE (
  bucket TIMESTAMP WITH TIME ZONE,
  conversations_count BIGINT,
  transactions_count BIGINT,
  paid_transactions_count BIGINT,
  customers_count BIGINT,
  incoming_messages_count BIGINT
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
  ),
  msg_agg AS (
    SELECT DATE_TRUNC(p_trunc_text, m.created_at) AS b, COUNT(*) AS c
    FROM public.messages m
    JOIN public.conversations c ON m.conversation_id = c.id
    WHERE m.sender_type = 'customer' AND m.created_at >= p_start AND m.created_at <= p_end AND c.bot_id = p_bot_id
    GROUP BY 1
  )
  SELECT 
    p.bucket,
    COALESCE(ca.c, 0)::BIGINT AS conversations_count,
    COALESCE(ta.c, 0)::BIGINT AS transactions_count,
    COALESCE(ta.paid_c, 0)::BIGINT AS paid_transactions_count,
    COALESCE(cua.c, 0)::BIGINT AS customers_count,
    COALESCE(ma.c, 0)::BIGINT AS incoming_messages_count
  FROM periods p
  LEFT JOIN conv_agg ca ON p.bucket = ca.b
  LEFT JOIN tx_agg ta ON p.bucket = ta.b
  LEFT JOIN cust_agg cua ON p.bucket = cua.b
  LEFT JOIN msg_agg ma ON p.bucket = ma.b
  ORDER BY p.bucket;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_chart_series(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
