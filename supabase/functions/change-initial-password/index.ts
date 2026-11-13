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

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile) return json(403, { message: "Perfil indisponível." });
  if (!profile.must_change_password) return json(409, { message: "A senha inicial já foi alterada." });

  let input: { password?: unknown };
  try {
    input = await request.json();
  } catch {
    return json(400, { message: "Dados inválidos." });
  }

  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 6) {
    return json(400, { message: "A nova senha deve ter pelo menos 6 caracteres." });
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    userData.user.id,
    { password },
  );
  if (passwordError) return json(400, { message: "Não foi possível atualizar a senha." });

  const { error: updateError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userData.user.id);
  if (updateError) return json(500, { message: "Senha alterada, mas não foi possível liberar o acesso." });

  return json(200, { success: true });
});
