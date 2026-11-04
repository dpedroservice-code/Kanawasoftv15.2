import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { success: false, message: "Método não permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
    return json(500, { success: false, message: "Serviço de integração não configurado no servidor." });
  }

  try {
    const body = await request.json();
    const companyId = String(body.company_id || "");
    if (!companyId) return json(400, { success: false, message: "Empresa não indicada." });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult.user) return json(401, { success: false, message: "Sessão inválida ou expirada." });

    const { data: membership, error: membershipError } = await userClient
      .from("ks_company_memberships")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userResult.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return json(403, { success: false, message: "Apenas o proprietário ou administrador pode testar a integração AGT." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: config, error: configError } = await admin.rpc("ks_get_agt_config_internal", { p_company_id: companyId });
    if (configError || !config || !config.metadata || !config.credentials) {
      return json(404, { success: false, message: "Guarde primeiro as credenciais e os dados de certificação AGT." });
    }

    const meta = config.metadata;
    const secrets = config.credentials;
    if (!meta.software_validation_number || !secrets.username || !secrets.password ||
        !secrets.software_private_key_pem || !secrets.taxpayer_private_key_pem) {
      return json(422, { success: false, message: "Faltam credenciais, número de validação ou chaves PEM." });
    }

    const softwareInfoDetail = {
      productId: meta.product_id,
      productVersion: meta.product_version,
      softwareValidationNumber: meta.software_validation_number,
      signatureVersion: meta.signature_version
    };
    const softwareKey = await importPKCS8(secrets.software_private_key_pem, "RS256");
    const taxpayerKey = await importPKCS8(secrets.taxpayer_private_key_pem, "RS256");
    const jwsSoftwareSignature = await new SignJWT(softwareInfoDetail)
      .setProtectedHeader({ alg: "RS256", typ: "JOSE" })
      .sign(softwareKey);
    const jwsSignature = await new SignJWT({ taxRegistrationNumber: meta.tax_registration_number })
      .setProtectedHeader({ alg: "RS256", typ: "JOSE" })
      .sign(taxpayerKey);

    const baseUrl = meta.environment === "prod"
      ? "https://sifp.minfin.gov.ao"
      : "https://sifphml.minfin.gov.ao";
    const payload = {
      schemaVersion: "2.0",
      taxRegistrationNumber: meta.tax_registration_number,
      submissionTimeStamp: new Date().toISOString(),
      establishmentNumber: meta.establishment_number,
      softwareInfo: {
        softwareInfoDetail,
        jwsSoftwareSignature
      },
      jwsSignature
    };

    const basic = btoa(String(secrets.username) + ":" + String(secrets.password));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    let responseBody: Record<string, unknown> = {};
    try {
      response = await fetch(baseUrl + "/sigt/fe/v1/listarSeries", {
        method: "POST",
        headers: {
          Authorization: "Basic " + basic,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const raw = await response.text();
      try { responseBody = JSON.parse(raw); }
      catch { responseBody = { message: raw.slice(0, 500) }; }
    } finally {
      clearTimeout(timeout);
    }

    const seriesCount = Number(responseBody.seriesResultCount ?? 0);
    const hasSeriesResponse = responseBody.seriesResultCount !== undefined ||
      responseBody.seriesInfo !== undefined || responseBody.seriresInfo !== undefined;
    const apiErrors = Array.isArray(responseBody.errorList) ? responseBody.errorList :
      (Array.isArray(responseBody.requestErrorList) ? responseBody.requestErrorList : []);
    const success = response.ok && hasSeriesResponse && apiErrors.length === 0;
    let message: string;
    if (success) {
      message = "Ligação AGT autenticada. " + seriesCount + " série(s) encontrada(s).";
    } else if (response.status === 401 || response.status === 403) {
      message = "A AGT recusou a autenticação. Confirme o utilizador e a palavra-passe Basic Auth.";
    } else if (response.status === 400 || response.status === 422) {
      message = "A API respondeu, mas rejeitou o pedido. Confirme o número de validação, as chaves, a assinatura e o estabelecimento.";
    } else {
      message = "A API AGT respondeu com HTTP " + response.status + ". Verifique os dados de integração.";
    }

    await admin.from("ks_fiscal_integrations").update({
      status: success ? "connected" : "failed",
      last_tested_at: new Date().toISOString(),
      last_test_message: message,
      updated_at: new Date().toISOString()
    }).eq("company_id", companyId);

    return json(success ? 200 : 502, {
      success,
      message,
      series_count: seriesCount,
      http_status: response.status,
      environment: meta.environment
    });
  } catch (error) {
    const safeError = error instanceof Error ? error : new Error("Falha desconhecida no teste AGT.");
    const message = safeError.name === "AbortError"
      ? "Tempo limite excedido ao contactar a AGT."
      : (safeError.message || "Falha desconhecida no teste AGT.");
    return json(502, { success: false, message });
  }
});