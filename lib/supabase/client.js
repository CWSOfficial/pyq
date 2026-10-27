import { createBrowserClient } from "@supabase/ssr";

let client;

export function createClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      throw new Error("Supabase is not configured. Check the public Supabase environment variables.");
    }

    client = createBrowserClient(url, key);
  }

  return client;
}
