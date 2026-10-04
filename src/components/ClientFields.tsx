const input =
  "mt-1 w-full rounded-xl bg-white px-3.5 py-2.5 text-[16px] ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-indigo-500";

export function ClientFields({
  defaults,
}: {
  defaults?: { name?: string; email?: string | null; drive_link?: string | null };
}) {
  return (
    <>
      <label className="block text-sm font-medium">
        Name
        <input name="name" required maxLength={100} defaultValue={defaults?.name} className={input} autoComplete="off" />
      </label>
      <label className="block text-sm font-medium">
        Email <span className="font-normal text-slate-400">(optional)</span>
        <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={input} autoComplete="off" />
      </label>
      <label className="block text-sm font-medium">
        Google Drive folder link <span className="font-normal text-slate-400">(optional)</span>
        <input
          name="drive_link"
          type="url"
          placeholder="https://drive.google.com/…"
          defaultValue={defaults?.drive_link ?? ""}
          className={input}
        />
      </label>
    </>
  );
}
