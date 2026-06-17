import { createClient } from "@supabase/supabase-js";

const tableName = process.env.SUPABASE_DASHBOARD_TABLE || "dashboard_snapshots";

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function loadDashboardSnapshot() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select("source_dir, source_signature, data, created_at")
    .eq("source_name", "mlh_dashboard")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase dashboard read failed: ${error.message}`);
  }

  if (!data?.data) return null;
  return {
    ...data.data,
    sourceDir: data.source_dir || "Supabase dashboard snapshot",
    sourceSignature: data.source_signature || "supabase-snapshot",
    cacheStatus: "supabase",
    supabaseMode: true,
    loadedAt: data.created_at ? Date.parse(data.created_at) : Date.now(),
  };
}
