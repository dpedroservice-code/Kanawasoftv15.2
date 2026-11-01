CREATE OR REPLACE FUNCTION public.ks_list_payment_provider_status()
RETURNS TABLE (
  provider_code text,
  display_name text,
  enabled boolean,
  mode text,
  supported_countries text[],
  checkout_url text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.provider_code, p.display_name, p.enabled, p.mode,
         p.supported_countries, p.checkout_url, p.updated_at
  FROM public.ks_payment_provider_settings AS p
  ORDER BY p.display_name;
$function$;

REVOKE ALL ON FUNCTION public.ks_list_payment_provider_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_list_payment_provider_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_get_map_provider_config()
RETURNS TABLE (
  provider text,
  routing_endpoint text,
  geocoding_endpoint text,
  is_demo_endpoint boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.provider, m.routing_endpoint, m.geocoding_endpoint, m.is_demo_endpoint
  FROM public.ks_map_provider_settings AS m
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.ks_get_map_provider_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_get_map_provider_config() TO authenticated;
