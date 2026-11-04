import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin"
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}
function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "ks_live_" + Array.from(bytes).map(v => v.toString(16).padStart(2, "0")).join("");
}
async function requireAdmin(req: Request, companyId: string) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Sessão de administrador obrigatória.");
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth, error } = await userClient.auth.getUser();
  if (error || !auth.user) throw new Error("Sessão inválida ou expirada.");
  const { data: membership, error: membershipError } = await admin
    .from("ks_company_memberships").select("role,status")
    .eq("company_id", companyId).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Apenas o proprietário ou administrador pode gerir integrações.");
  }
  return auth.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/catalog/products")) {
      const authorization = req.headers.get("Authorization") || "";
      const apiKey = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!apiKey.startsWith("ks_live_") || apiKey.length < 40) return json(401, { error: "Chave de API inválida." });
      const prefix = apiKey.slice(0, 20);
      const hash = await sha256(apiSecret);
      const { data: key, error: keyError } = await admin.from("ks_store_api_keys")
        .select("id,company_id,scopes,allowed_origins,revoked_at")
        .eq("key_prefix", prefix).eq("secret_hash", hash).maybeSingle();
      if (keyError || !key || key.revoked_at || !key.scopes.includes("catalog:read")) {
        return json(403, { error: "Chave revogada ou sem permissão para consultar o catálogo." });
      }
      const origin = req.headers.get("Origin");
      if (origin && key.allowed_origins?.length && !key.allowed_origins.includes(origin)) {
        return json(403, { error: "Origem não autorizada para esta chave." });
      }
      await admin.from("ks_store_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
      const { data: products, error } = await admin.from("ks_products")
        .select("external_id,sku,name,category,unit,unit_price,stock_quantity,min_stock,description,image_path,updated_at")
        .eq("company_id", key.company_id).eq("is_active", true).order("name");
      if (error) return json(500, { error: "Não foi possível consultar o catálogo." });
      return json(200, { success: true, company_id: key.company_id, count: products?.length || 0, products: products || [] });
    }

    if (req.method !== "POST") return json(405, { error: "Método não permitido." });
    const body = await req.json();
    const companyId = String(body.company_id || "");
    if (!companyId) return json(400, { error: "Empresa não indicada." });
    const user = await requireAdmin(req, companyId);

    if (body.action === "create-key") {
      const name = String(body.name || "").trim();
      const purpose = String(body.purpose || "").trim();
      if (name.length < 2 || purpose.length < 5) return json(422, { error: "Indique o nome da integração e a finalidade." });
      const secret = randomSecret();
      const hash = await sha256(secret);
      const prefix = secret.slice(0, 20);
      const origins = Array.isArray(body.allowed_origins) ? body.allowed_origins.map((v: unknown) => String(v).trim()).filter(Boolean).slice(0, 20) : [];
      const { data, error } = await admin.from("ks_store_api_keys").insert({
        company_id: companyId, name, purpose, key_prefix: prefix, secret_hash: hash,
        scopes: ["catalog:read"], allowed_origins: origins, created_by: user.id
      }).select("id,name,key_prefix,scopes,allowed_origins,created_at").single();
      if (error) return json(500, { error: "Não foi possível criar a chave de API." });
      return json(201, { success: true, key: data, secret, warning: "Copie esta chave agora. O segredo completo não volta a ser apresentado." });
    }

    if (body.action === "list-keys") {
      const { data, error } = await admin.from("ks_store_api_keys")
        .select("id,name,purpose,key_prefix,scopes,allowed_origins,last_used_at,revoked_at,created_at")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) return json(500, { error: "Não foi possível listar as chaves." });
      return json(200, { success: true, keys: data || [] });
    }

    if (body.action === "revoke-key") {
      const id = String(body.key_id || "");
      const { error } = await admin.from("ks_store_api_keys").update({ revoked_at: new Date().toISOString() })
        .eq("company_id", companyId).eq("id", id).is("revoked_at", null);
      if (error) return json(500, { error: "Não foi possível revogar a chave." });
      return json(200, { success: true, message: "Chave revogada." });
    }

    if (body.action === "list-payments") {
      const { data, error } = await admin.from("ks_company_payment_integrations")
        .select("provider_code,display_name,purpose,enabled,mode,status,last_tested_at,last_test_message,updated_at")
        .eq("company_id", companyId).order("updated_at", { ascending: false });
      if (error) return json(500, { error: "Não foi possível listar os métodos de pagamento." });
      return json(200, { success: true, payments: data || [] });
    }

    if (body.action === "save-payment") {
      const provider = String(body.provider_code || "").trim().toLowerCase();
      const display = String(body.display_name || "").trim();
      const purpose = String(body.purpose || "").trim();
      if (!provider || !display || purpose.length < 5) return json(422, { error: "Preencha o método, nome e finalidade." });
      const secrets: Record<string, string> = {};
      for (const field of ["api_key", "api_secret", "merchant_id", "webhook_secret"]) {
        const value = String(body[field] || "").trim();
        if (value) secrets[field] = value;
      }
      const { error } = await admin.rpc("ks_save_company_payment_internal", {
        p_company_id: companyId, p_provider_code: provider, p_display_name: display, p_purpose: purpose,
        p_enabled: body.enabled === true, p_mode: ["sandbox", "production", "manual"].includes(body.mode) ? body.mode : "sandbox",
        p_public_config: { checkout_url: String(body.checkout_url || ""), account_reference: String(body.account_reference || "") },
        p_secret: Object.keys(secrets).length ? secrets : null
      });
      if (error) return json(500, { error: "Não foi possível guardar a configuração de pagamento." });
      return json(200, { success: true, message: "Configuração guardada no servidor. A ativação de transações reais depende da integração oficial do fornecedor." });
    }

    if (body.action === "test-payment") {
      const provider = String(body.provider_code || "").trim().toLowerCase();
      const { data, error } = await admin.from("ks_company_payment_integrations")
        .select("enabled,mode,secret_id,display_name").eq("company_id", companyId).eq("provider_code", provider).maybeSingle();
      if (error || !data) return json(404, { success: false, message: "Guarde primeiro a configuração deste método." });
      const ready = data.mode === "manual" || !!data.secret_id;
      return json(200, { success: ready, live_transaction_tested: false,
        message: ready ? "Configuração e credenciais encontradas. Ainda não foi feita uma transação real: falta ligar o endpoint oficial do fornecedor." : "Faltam credenciais para este método." });
    }

    return json(400, { error: "Ação desconhecida." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    const status = /sessão/i.test(message) ? 401 : /apenas o proprietário|administrador/i.test(message) ? 403 : 500;
    return json(status, { error: message });
  }
});
