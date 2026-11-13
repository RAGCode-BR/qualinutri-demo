import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

export const isSupabaseConfigured = false;
export const supabase: SupabaseClient<Database> | null = null;
