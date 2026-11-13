import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  const { data: callerProfile, error: callerError } = await admin
    .from("profiles")
    .select("role,active,must_change_password")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (
    callerError
    || !callerProfile?.active
    || callerProfile.must_change_password
    || callerProfile.role !== "administrador"
  ) {
    return json(403, { message: "Apenas administradores podem redefinir senhas." });
  }

  let input: { userId?: unknown; temporaryPassword?: unknown };
  try {
    input = await request.json();
  } catch {
    return json(400, { message: "Dados inválidos." });
  }

  const userId = typeof input.userId === "string" ? input.userId : "";
  const temporaryPassword = typeof input.temporaryPassword === "string" ? input.temporaryPassword : "";
  if (userId === userData.user.id) {
    return json(400, { message: "Um administrador não pode redefinir a própria senha por esta tela." });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json(400, { message: "Usuário inválido." });
  }
  if (temporaryPassword.length < 6) {
    return json(400, { message: "A senha temporária deve ter pelo menos 6 caracteres." });
  }

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id,must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !targetProfile) return json(404, { message: "Usuário não encontrado." });

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (profileError) return json(500, { message: "Não foi possível preparar a troca obrigatória de senha." });

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    userId,
    { password: temporaryPassword },
  );
  if (passwordError) {
    if (!targetProfile.must_change_password) {
      await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
    }
    return json(400, { message: "Não foi possível redefinir a senha." });
  }

  return json(200, { success: true });
});
