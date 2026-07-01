import { USE_SUPABASE, isSupabaseConfigured } from "./config";
import { supabase } from "./supabase";

export async function uploadImageToSupabase(file: File) {
  if (!USE_SUPABASE || !isSupabaseConfigured || !supabase) {
    return URL.createObjectURL(file);
  }

  const path = `${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("scan-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) throw error;

  const { data } = supabase.storage.from("scan-images").getPublicUrl(path);
  return data.publicUrl;
}
