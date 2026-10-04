import { GoogleButton } from "./GoogleButton";

const ERRORS: Record<string, string> = {
  not_allowed: "This Google account isn't allowed to use this app.",
  auth: "Sign-in didn't complete. Please try again.",
  setup: "Signed in, but your account couldn't be set up. Check the server logs.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold">Client Chat</h1>
        <p className="mt-2 text-sm text-slate-500">All your client conversations, one inbox.</p>
        {message && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <GoogleButton />
      </div>
    </main>
  );
}
