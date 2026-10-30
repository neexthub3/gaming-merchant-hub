CREATE OR REPLACE FUNCTION public.claim_first_admin(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(72841936);
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Administrator already configured' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RAISE EXCEPTION 'Player not found'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user, 'admin');
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_admin(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.claim_admin(text, uuid) IS 'DEPRECATED: replaced by service-role-only claim_first_admin';