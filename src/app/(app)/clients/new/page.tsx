import Link from "next/link";
import { NewClientForm } from "./NewClientForm";

export default function NewClientPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="-ml-2 rounded-full p-2 text-slate-600" aria-label="Back to inbox">
          ←
        </Link>
        <h1 className="text-lg font-semibold">Add client</h1>
      </header>
      <NewClientForm />
    </main>
  );
}
