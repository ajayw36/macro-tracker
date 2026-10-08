import { Card, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-5">
      <h1 className="text-3xl font-extrabold tracking-tight">MACROS</h1>
      <p className="mt-1 text-sm text-muted">Enter your password to continue.</p>

      <Card className="mt-6">
        <SectionLabel>Sign in</SectionLabel>
        <form action="/api/login" method="POST" className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <input
            type="password"
            name="password"
            autoFocus
            placeholder="Password"
            className="input"
          />
          {sp.error && (
            <p className="text-xs text-red-400">Incorrect password. Try again.</p>
          )}
          <button
            type="submit"
            className="rounded-md bg-lime px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
          >
            Unlock
          </button>
        </form>
      </Card>
    </main>
  );
}
