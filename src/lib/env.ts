function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name} (see README setup checklist)`);
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in the browser bundle.
export const SUPABASE_URL = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
