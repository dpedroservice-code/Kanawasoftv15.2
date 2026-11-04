import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("KANAWA_CREDENTIALS_ENCRYPTION_KEY") || "";
const SITE_URL = "https://kanawasoft.shop";
const ALLOWED_ORIGINS = new Set([SITE_URL,"https://kanawa-soft.netlify.app","http://localhost:3000","http://localhost:5173"]);
const PROVIDERS = new Set([
  "bank_api","card_gateway","multicaixa_express","whatsapp_cloud","smtp_gmail",
  "agt","maps","carrier_macon","carrier_cfl","carrier_cfb","ncarga"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.has(origin) || /^https:\/\/deploy-preview-\d+--kanawa-soft\.netlify\.app$/.test(origin);
}
function respond(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":allowedOrigin(origin) ? origin : SITE_URL,
      "Access-Control-Allow-Headers":"authorization, apikey, content-type",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Vary":"Origin",
      "Cache-Control":"no-store"
    }
  });
}
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
function encodeBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
function safeMetadata(value: unknown): Record<string,string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string,unknown>;
  const output: Record<string,string> = {};
  const allowed = ["label","environment","endpoint","account_last4","sender_id","phone_number"];
  for (const key of allowed) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const text = raw.trim().slice(0,240);
    if (key === "endpoint" && text) {
      try {
        const url = new URL(text);
        if (url.protocol !== "https:") continue;
        output[key] = url.toString();
      } catch { continue; }
    } else if (key === "environment" && text && !["sandbox","production"].includes(text)) {
      continue;
    } else if (text) output[key] = text;
  }
  return output;
}
async function encryptSecret(secret: Record<string,unknown>) {
  if (!ENCRYPTION_KEY) throw new Error("KANAWA_CREDENTIALS_ENCRYPTION_KEY não está configurada no servidor.");
  const keyBytes = decodeBase64(ENCRYPTION_KEY);
  if (keyBytes.length !== 32) throw new Error("A chave de cifragem do servidor deve conter 32 bytes em Base64.");
  const serialized = JSON.stringify(secret);
  if (serialized.length < 2 || serialized.length > 32768) throw new Error("O conteúdo das credenciais deve ter até 32 KB.");
  const keyBuffer = new ArrayBuffer(32);
  new Uint8Array(keyBuffer).set(keyBytes);
  const key = await crypto.subtle.importKey("raw",keyBuffer,{name:"AES-GCM"},false,["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,new TextEncoder().encode(serialized));
  return { ciphertext:encodeBase64(new Uint8Array(encrypted)), nonce:encodeBase64(nonce) };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || SITE_URL;
  if (request.method === "OPTIONS") return respond(204,{},origin);
  if (request.method !== "POST") return respond(405,{error:"Método não permitido."},origin);
  if (!allowedOrigin(origin)) return respond(403,{error:"Origem não autorizada."},origin);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i,"");
  if (!token) return respond(401,{error:"Sessão não autenticada."},origin);

  const admin = createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const {data:authData,error:authError} = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond(401,{error:"Sessão inválida ou expirada."},origin);
    const caller = authData.user;
    const body = await request.json();
    const companyId = String(body.company_id || "");
    const providerCode = String(body.provider_code || "");
    const action = String(body.action || "save");

    if (!UUID.test(companyId)) return respond(400,{error:"Empresa inválida."},origin);
    if (!PROVIDERS.has(providerCode)) return respond(400,{error:"Fornecedor não permitido."},origin);
    if (!["save","delete"].includes(action)) return respond(400,{error:"Operação inválida."},origin);

    const {data:membership,error:membershipError} = await admin
      .from("ks_company_memberships").select("role,status")
      .eq("company_id",companyId).eq("user_id",caller.id).eq("status","active").maybeSingle();
    if (membershipError || !membership || !["owner","admin"].includes(membership.role)) {
      return respond(403,{error:"Apenas o proprietário ou administrador pode gerir credenciais."},origin);
    }

    if (action === "delete") {
      const {error} = await admin.from("ks_company_provider_credentials")
        .delete().eq("company_id",companyId).eq("provider_code",providerCode);
      if (error) return respond(400,{error:"Não foi possível remover a credencial."},origin);
      return respond(200,{success:true,provider_code:providerCode,action:"deleted"},origin);
    }

    const secret = body.secret;
    if (!secret || typeof secret !== "object" || Array.isArray(secret)) {
      return respond(400,{error:"Envie as credenciais num objeto JSON."},origin);
    }
    let encrypted: {ciphertext:string;nonce:string};
    try { encrypted = await encryptSecret(secret as Record<string,unknown>); }
    catch (error) { return respond(503,{error:error instanceof Error ? error.message : "Cifragem indisponível."},origin); }

    const {error:saveError} = await admin.from("ks_company_provider_credentials").upsert({
      company_id:companyId,
      provider_code:providerCode,
      secret_ciphertext:encrypted.ciphertext,
      secret_nonce:encrypted.nonce,
      key_version:1,
      metadata:safeMetadata(body.metadata),
      updated_by:caller.id,
      updated_at:new Date().toISOString()
    },{onConflict:"company_id,provider_code"});
    if (saveError) return respond(400,{error:"Não foi possível guardar a credencial cifrada."},origin);

    return respond(200,{success:true,provider_code:providerCode,action:"saved",message:"Credencial guardada cifrada no servidor. O segredo não foi devolvido ao navegador."},origin);
  } catch (_error) {
    return respond(500,{error:"Erro interno ao processar a credencial."},origin);
  }
});
