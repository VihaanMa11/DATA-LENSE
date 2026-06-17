import { createClient } from "@supabase/supabase-js";

const tableName = process.env.SUPABASE_DASHBOARD_TABLE || "dashboard_snapshots";
const uploadBatchTable = process.env.SUPABASE_UPLOAD_BATCH_TABLE || "dashboard_upload_batches";
const uploadFileTable = process.env.SUPABASE_UPLOAD_FILE_TABLE || "dashboard_uploaded_files";

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
    .select("source_dir, source_signature, data, created_at, upload_batch_id")
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
    uploadBatchId: data.upload_batch_id || null,
    loadedAt: data.created_at ? Date.parse(data.created_at) : Date.now(),
  };
}

export async function createUploadedFileBatch({ files, status = "uploaded", message = "Dashboard files uploaded." }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const batchInsert = await supabase
    .from(uploadBatchTable)
    .insert({
      source_name: "mlh_dashboard",
      status,
      file_count: files.length,
      message,
    })
    .select("id")
    .single();
  if (batchInsert.error) throw new Error(`Supabase upload batch insert failed: ${batchInsert.error.message}`);

  const uploadBatchId = batchInsert.data.id;
  const fileRows = files.map((file) => ({
    batch_id: uploadBatchId,
    file_name: file.originalname,
    file_size: file.size,
    mime_type: file.mimetype || "application/octet-stream",
    file_ext: file.originalname.includes(".") ? file.originalname.split(".").pop().toLowerCase() : "",
    content_base64: file.buffer.toString("base64"),
  }));

  const fileInsert = await supabase.from(uploadFileTable).insert(fileRows);
  if (fileInsert.error) throw new Error(`Supabase file insert failed: ${fileInsert.error.message}`);

  return { uploadBatchId };
}

export async function updateUploadBatchStatus({ uploadBatchId, status, message }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const update = await supabase
    .from(uploadBatchTable)
    .update({ status, message })
    .eq("id", uploadBatchId);
  if (update.error) throw new Error(`Supabase upload batch update failed: ${update.error.message}`);
}

export async function saveDashboardSnapshot({ data, sourceDir, sourceSignature, uploadBatchId = null }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const inactive = await supabase
    .from(tableName)
    .update({ is_active: false })
    .eq("source_name", "mlh_dashboard")
    .eq("is_active", true);
  if (inactive.error) throw new Error(`Supabase snapshot update failed: ${inactive.error.message}`);

  const snapshotInsert = await supabase.from(tableName).insert({
    source_name: "mlh_dashboard",
    source_dir: sourceDir,
    source_signature: sourceSignature,
    upload_batch_id: uploadBatchId,
    data,
    is_active: true,
  });
  if (snapshotInsert.error) throw new Error(`Supabase snapshot insert failed: ${snapshotInsert.error.message}`);

  return { uploadBatchId };
}

export async function saveUploadedDashboardSnapshot({ data, files, sourceDir, sourceSignature }) {
  const { uploadBatchId } = await createUploadedFileBatch({
    files,
    status: "processed",
    message: "Dashboard files uploaded and parsed successfully.",
  });
  await saveDashboardSnapshot({ data, sourceDir, sourceSignature, uploadBatchId });
  return { uploadBatchId };
}
