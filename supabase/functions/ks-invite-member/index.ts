import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://kanawasoft.shop";
const ALLOWED_ORIGINS = new Set([SITE_URL, "https://deploy-preview-2--kanawa-soft.netlify.app", "http://localhost:3000", "http://localhost:5173"]);
const ALLOWED_ROLES = new Set(["manager", "operator", "cashier", "accountant", "viewer"]);

function response(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || SITE_URL;
  if (req.method === "OPTIONS") return response(204, {}, origin);
  if (req.method !== "POST") return response(405, { error: "Método não permitido." }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return response(403, { error: "Origem não autorizada." }, origin);
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return response(401, { error: "Sessão não autenticada." }, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response(401, { error: "Sessão inválida ou expirada." }, origin);
    const caller = authData.user;
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const companyId = String(body.company_id || "").trim();
    const role = String(body.role || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response(400, { error: "Introduza um endereço de email válido." }, origin);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) return response(400, { error: "Empresa inválida." }, origin);
    if (!ALLOWED_ROLES.has(role)) return response(400, { error: "Perfil de acesso não permitido." }, origin);

    const { data: membership, error: membershipError } = await admin.from("ks_company_memberships")
      .select("role,status").eq("company_id", companyId).eq("user_id", caller.id).eq("status", "active").maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return response(403, { error: "Apenas o proprietário ou administrador pode convidar utilizadores." }, origin);
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: SITE_URL, data: { full_name: fullName || email.split("@")[0] }
    });
    if (inviteError || !invited.user) return response(409, {
      error: inviteError?.message || "Não foi possível enviar o convite. O email pode já estar registado."
    }, origin);

    const { error: insertError } = await admin.from("ks_company_memberships").insert({
      company_id: companyId, user_id: invited.user.id, role, status: "invited"
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return response(500, { error: "O convite não pôde ser associado à empresa. O registo temporário foi revertido." }, origin);
    }
    return response(201, { success: true, email, role, status: "invited",
      message: "Convite enviado. O acesso será activado depois da confirmação do email." }, origin);
  } catch (_error) {
    return response(500, { error: "Erro interno ao processar o convite." }, origin);
  }
});