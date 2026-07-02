import { USE_SUPABASE, isSupabaseConfigured } from "./config";
import { supabase } from "./supabase";

export async function uploadImageToSupabase(file: File) {
  if (!USE_SUPABASE || !isSupabaseConfigured || !supabase) {
    return URL.createObjectURL(file);
  }

  const path = `${Date.now()}-${file.name}`;
  try {
    const { error } = await supabase.storage.from("scan-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (error) return URL.createObjectURL(file);

    const { data } = supabase.storage.from("scan-images").getPublicUrl(path);
    return data.publicUrl || URL.createObjectURL(file);
  } catch {
    return URL.createObjectURL(file);
  }
}
