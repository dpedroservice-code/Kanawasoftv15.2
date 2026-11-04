import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "kanawa-private-documents";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

async function listFilesRecursively(prefix: string, admin: ReturnType<typeof createClient>): Promise<string[]> {
  const bucket = admin.storage.from(BUCKET);
  const files: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("Falha ao listar documentos privados: " + error.message);
    const items = data || [];
    for (const item of items) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      if (!item.id || !item.metadata) {
        files.push(...await listFilesRecursively(path, admin));
      } else {
        files.push(path);
      }
    }
    if (items.length < 1000) break;
    offset += items.length;
  }
  return files;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "Sessão obrigatória." });

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: "Sessão inválida ou expirada." });

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) return json(400, { error: "Empresa inválida." });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: membership, error: membershipError } = await admin
      .from("ks_company_memberships")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || membership.role !== "owner") return json(403, { error: "A reposição total exige o proprietário ativo da empresa." });

    const files = await listFilesRecursively(companyId, admin);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + 100));
      if (error) throw new Error("Falha ao apagar documentos privados: " + error.message);
    }

    const { data: resetData, error: resetError } = await userClient.rpc("ks_reset_company_business_data", { p_company_id: companyId });
    if (resetError) throw resetError;
    return json(200, { ok: true, removed_private_documents: files.length, reset: resetData });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Falha na reposição segura da empresa." });
  }
});
