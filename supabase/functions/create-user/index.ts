import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const loginPattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const allowedRoles = new Set(["administrador", "comercial", "consulta"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Método não permitido." });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return json(401, { message: "Sessão inválida." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { message: "Serviço indisponível." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(401, { message: "Sessão inválida." });

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role,active,must_change_password")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (
    profileError
    || !callerProfile?.active
    || callerProfile.must_change_password
    || callerProfile.role !== "administrador"
  ) {
    return json(403, { message: "Apenas administradores podem criar usuários." });
  }

  let input: { login?: unknown; password?: unknown; displayName?: unknown; role?: unknown; active?: unknown };
  try {
    input = await request.json();
  } catch {
    return json(400, { message: "Dados inválidos." });
  }

  const login = typeof input.login === "string" ? input.login.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const role = typeof input.role === "string" ? input.role : "consulta";
  const active = input.active === true;

  if (!loginPattern.test(login)) {
    return json(400, { message: "Login inválido." });
  }
  if (password.length < 6) {
    return json(400, { message: "A senha deve ter pelo menos 6 caracteres." });
  }
  if (!displayName || displayName.length > 120) {
    return json(400, { message: "Informe um nome com até 120 caracteres." });
  }
  if (!allowedRoles.has(role)) {
    return json(400, { message: "Perfil inválido." });
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("login", login)
    .maybeSingle();
  if (existingProfile) return json(409, { message: "Este login já está em uso." });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${login}@login.qualinutri.invalid`,
    password,
    email_confirm: true,
    user_metadata: { login, display_name: displayName },
  });
  if (createError || !created.user) {
    return json(400, { message: "Não foi possível criar o usuário. Verifique se o login já existe." });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role, active, must_change_password: true })
    .eq("id", created.user.id);
  if (updateError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { message: "Não foi possível configurar o acesso do usuário." });
  }

  return json(201, { login, role, active });
});
