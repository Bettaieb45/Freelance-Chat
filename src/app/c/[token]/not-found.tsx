export default function LinkNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-500">It may have been replaced. Ask for a new link.</p>
      </div>
    </main>
  );
}
