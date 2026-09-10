import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Accept both JWT (eyJ...) and new publishable (sb_publishable_...) key formats
const isConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnonKey.includes('xxxxxxxxxxxx') &&
  (supabaseAnonKey.startsWith('sb_publishable_') || supabaseAnonKey.startsWith('eyJ'));

if (!isConfigured) {
  console.warn(
    '[VisionGuard] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file or Vercel environment variables.'
  );
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false, // No auth sessions — VisionGuard uses its own admin login
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'x-application-name': 'VisionGuard',
        },
      },
    })
  : null;

export const isSupabaseConfigured = isConfigured;

// ---------------------------------------------------------------------------
// Retry helper: wraps any async operation with exponential backoff retries
// ---------------------------------------------------------------------------
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1.5s, 3s, 6s
        console.warn(`[VisionGuard] Attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms...`, err);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Supabase health check — tests connectivity on startup
// Returns: 'connected' | 'misconfigured' | 'unauthorized' | 'error'
// ---------------------------------------------------------------------------
export async function testSupabaseConnection(): Promise<'connected' | 'misconfigured' | 'unauthorized' | 'error'> {
  if (!supabase) return 'misconfigured';
  try {
    const { error } = await supabase.from('system_settings').select('id').limit(1);
    if (!error) return 'connected';
    if (error.code === '401' || error.message?.includes('Invalid API key') || error.message?.includes('JWT')) {
      return 'unauthorized';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// Upload a base64 encoded image to Supabase Storage bucket 'face-images'
// Returns the public URL or null on failure.
// ---------------------------------------------------------------------------
export async function uploadImageToSupabase(
  base64Data: string,
  userId: string,
  fileName: string
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const blob = await fetch(base64Data).then(res => res.blob());
    const path = `${userId}/${fileName}`;

    const { error } = await supabase.storage
      .from('face-images')
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[Supabase Storage] Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('face-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[Supabase Storage] Error converting/uploading image:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Upload unauthorized detection snapshot directly to bucket 'detection-snapshots' or 'face-images'
// ---------------------------------------------------------------------------
export async function uploadDetectionSnapshotToSupabase(
  base64Data: string,
  logId: string
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const blob = await fetch(base64Data).then(res => res.blob());
    const path = `unauthorized_snapshots/${logId}_${Date.now()}.jpg`;

    // Upload to face-images bucket under unauthorized_snapshots folder
    const { error } = await supabase.storage
      .from('face-images')
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[Supabase Storage] Unauthorized snapshot upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('face-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[Supabase Storage] Exception uploading unauthorized snapshot:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete all files inside Supabase Storage bucket 'face-images' under user folder
// ---------------------------------------------------------------------------
export async function deleteUserImagesFromSupabase(userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { data: files, error: listError } = await supabase.storage
      .from('face-images')
      .list(userId);

    if (listError || !files) {
      console.warn('[Supabase Storage] List error:', listError);
      return;
    }

    if (files.length === 0) return;

    const filePaths = files.map(file => `${userId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from('face-images')
      .remove(filePaths);

    if (deleteError) {
      console.error('[Supabase Storage] Remove error:', deleteError);
    } else {
      console.log(`[Supabase Storage] Deleted ${filePaths.length} files for user ${userId}`);
    }
  } catch (err) {
    console.error('[Supabase Storage] Error deleting user images:', err);
  }
}
