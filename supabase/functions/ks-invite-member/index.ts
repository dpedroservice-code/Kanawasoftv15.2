import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://kanawasoft.shop";
const FIXED_ORIGINS = new Set([SITE_URL, "http://localhost:3000", "http://localhost:5173"]);
const ALLOWED_ROLES = new Set(["manager", "operator", "cashier", "accountant", "viewer"]);

const DEFAULT_PERMISSIONS: Record<string, Record<string, string[]>> = {
  manager: {
    dashboard: ["ver"], pdv: ["ver", "criar"], vendas: ["ver", "criar", "editar", "aprovar", "cancelar", "exportar"],
    produtos: ["ver", "criar", "editar"], categorias: ["ver", "criar", "editar"], estoque: ["ver", "criar", "editar"],
    compras: ["ver", "criar", "editar", "aprovar"], clientes: ["ver", "criar", "editar"], fornecedores: ["ver", "criar", "editar"],
    crm: ["ver", "criar", "editar"], financeiro: ["ver", "criar", "editar", "exportar"], fiscal: ["ver", "criar", "exportar"],
    rh: ["ver", "criar", "editar"], projetos: ["ver", "criar", "editar"], tarefas: ["ver", "criar", "editar"],
    ativos: ["ver", "criar", "editar"], frota: ["ver", "criar", "editar"], os: ["ver", "criar", "editar"],
    documentos: ["ver", "criar", "editar"], relatorios: ["ver", "exportar"], notificacoes: ["ver"], orcamentos: ["ver", "criar", "editar"],
    transportadoras: ["ver", "criar", "editar"], contratos: ["ver", "criar", "editar"], tickets: ["ver", "criar", "editar"],
    perfil: ["ver"], producao: ["ver", "criar", "editar"], "ordens-producao": ["ver", "criar", "editar"],
    mrp: ["ver", "criar", "editar"], bom: ["ver", "criar", "editar"], "custos-producao": ["ver", "editar"],
    "controle-qualidade": ["ver", "criar", "editar"], "planos-producao": ["ver", "criar", "editar"],
    "logistica-roteirizacao": ["ver", "criar", "editar"], "logistica-etiquetas": ["ver", "criar"],
    "logistica-picking": ["ver", "criar", "editar"], "logistica-armazens": ["ver", "criar", "editar"],
    "logistica-crossdocking": ["ver", "criar", "editar"], "logistica-rastreio": ["ver"],
    "ecommerce-vitrine": ["ver"], "ecommerce-carrinho": ["ver"], "ecommerce-pedidos": ["ver", "criar", "editar"],
    "ecommerce-produtos": ["ver", "criar", "editar"], "ecommerce-pagamento": ["ver"], "ecommerce-rastreio": ["ver"],
    "rh-recrutamento": ["ver", "criar", "editar"], "rh-desempenho": ["ver", "editar"], "rh-beneficios": ["ver", "editar"],
    "rh-onboarding": ["ver", "criar", "editar"], "rh-ponto": ["ver", "editar"], "rh-rescisao": ["ver", "editar"],
    "rh-plano-carreira": ["ver"], "projetos-tarefas": ["ver", "criar", "editar"], "projetos-kanban": ["ver", "editar"],
    "projetos-gantt": ["ver", "editar"], "projetos-recursos": ["ver", "editar"], "projetos-timesheet": ["ver", "criar", "editar"],
    "projetos-custos": ["ver", "editar"], "projetos-riscos": ["ver", "editar"], "ativos-depreciacao": ["ver", "editar"],
    "ativos-manutencao": ["ver", "criar", "editar"], "ativos-garantia": ["ver"], "frota-manutencao": ["ver", "criar", "editar"],
    "frota-rotas": ["ver", "criar", "editar"], "frota-gps": ["ver"], "frota-combustivel": ["ver", "criar", "editar"],
    "frota-documentos": ["ver"], "frota-multas": ["ver", "criar", "editar"], "frota-desempenho": ["ver"],
    "os-manutencao": ["ver", "criar", "editar"], "os-checklist": ["ver", "criar", "editar"], "os-calendario": ["ver", "criar", "editar"],
    "os-tecnicos": ["ver", "criar", "editar"], "produtos-avaliacoes": ["ver", "criar", "editar"], "tabelas-precos": ["ver", "criar", "editar"],
    "vendas-consignadas": ["ver", "criar", "editar"], "vendas-promocoes": ["ver", "criar", "editar"],
    "clientes-fidelidade": ["ver", "criar", "editar"], "clientes-cupons": ["ver", "criar", "editar"], "portal-cliente": ["ver"],
    "clientes-segmentacao": ["ver", "criar", "editar"], "crm-pipeline": ["ver", "criar", "editar"], "crm-automacao": ["ver", "criar", "editar"],
    "crm-score": ["ver"], "crm-remarketing": ["ver", "criar"], "marketing-campanhas": ["ver", "criar", "editar"],
    "marketing-analise": ["ver", "exportar"], "elearning-cursos": ["ver", "criar", "editar"],
    "elearning-certificacoes": ["ver", "criar", "editar"], "elearning-quizzes": ["ver", "criar", "editar"],
    "elearning-progresso": ["ver"], "elearning-relatorios": ["ver", "exportar"], servicos: ["ver", "criar", "editar"]
  },
  operator: {
    dashboard: ["ver"], pdv: ["ver", "criar"], vendas: ["ver", "criar"], produtos: ["ver"], clientes: ["ver"],
    estoque: ["ver"], notificacoes: ["ver"], perfil: ["ver"], producao: ["ver"], "ordens-producao": ["ver", "editar"],
    "controle-qualidade": ["ver", "criar"], os: ["ver", "criar"], "os-manutencao": ["ver", "criar"],
    "os-checklist": ["ver", "criar"], "os-calendario": ["ver"], "projetos-tarefas": ["ver", "criar"],
    "projetos-kanban": ["ver", "editar"], tarefas: ["ver", "criar"]
  },
  cashier: {
    pdv: ["ver", "criar"], vendas: ["ver", "criar"], clientes: ["ver"], produtos: ["ver"], notificacoes: ["ver"],
    perfil: ["ver"], "ecommerce-vitrine": ["ver"], "ecommerce-carrinho": ["ver"], "ecommerce-pedidos": ["ver", "criar"]
  },
  accountant: {
    dashboard: ["ver"], vendas: ["ver"], compras: ["ver"], clientes: ["ver"], fornecedores: ["ver"],
    financeiro: ["ver", "criar", "editar", "exportar"], fiscal: ["ver", "exportar"], relatorios: ["ver", "exportar"], perfil: ["ver"]
  },
  viewer: {
    dashboard: ["ver"], vendas: ["ver"], produtos: ["ver"], clientes: ["ver"], estoque: ["ver"],
    relatorios: ["ver"], notificacoes: ["ver"], perfil: ["ver"]
  }
};

function allowedOrigin(origin: string) {
  return FIXED_ORIGINS.has(origin) || /^https:\/\/deploy-preview-\d+--kanawa-soft\.netlify\.app$/.test(origin);
}
function response(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : SITE_URL,
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
  if (!allowedOrigin(origin)) return response(403, { error: "Origem não autorizada." }, origin);

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return response(401, { error: "Sessão não autenticada." }, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
      return response(400, { error: "Empresa inválida." }, origin);
    }
    if (!ALLOWED_ROLES.has(role)) return response(400, { error: "Perfil de acesso não permitido." }, origin);
    if (fullName.length < 2 || fullName.length > 120) return response(400, { error: "Introduza o nome completo." }, origin);

    const { data: membership, error: membershipError } = await admin
      .from("ks_company_memberships").select("role,status")
      .eq("company_id", companyId).eq("user_id", caller.id).eq("status", "active").maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return response(403, { error: "Apenas o proprietário ou administrador pode convidar utilizadores." }, origin);
    }
    const { data: primaryMembership } = await admin
      .from("ks_company_memberships").select("company_id")
      .eq("user_id", caller.id).eq("status", "active")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!primaryMembership || primaryMembership.company_id !== companyId) {
      return response(409, { error: "A empresa selecionada não corresponde à empresa ativa desta sessão." }, origin);
    }

    const permissions = body.permissions && typeof body.permissions === "object" && !Array.isArray(body.permissions)
      ? body.permissions : DEFAULT_PERMISSIONS[role];
    const { data: invitation, error: invitationError } = await callerClient.rpc("ks_create_team_invitation", {
      p_email: email, p_full_name: fullName, p_role: role, p_permissions: permissions, p_expires_hours: 72
    });
    if (invitationError || !invitation) {
      return response(400, { error: invitationError?.message || "Não foi possível criar o convite." }, origin);
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: SITE_URL,
      data: { full_name: fullName, invitation_code: invitation.invitation_code }
    });
    if (inviteError || !invited.user) {
      await admin.from("ks_team_invitations").delete().eq("id", invitation.id);
      return response(409, { error: inviteError?.message || "Não foi possível enviar o email de convite." }, origin);
    }
    return response(201, {
      success: true, email, role, status: "invited",
      message: "Convite enviado. O acesso será ativado após a confirmação do email."
    }, origin);
  } catch (_error) {
    return response(500, { error: "Erro interno ao processar o convite." }, origin);
  }
});
