import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import GroupTable from "@/app/components/GroupTable";

export default async function GroupsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [{ data: profile }, { data: standings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("wallet_address, avatar_url, username")
      .eq("id", user.id)
      .single(),
    supabase
      .from("group_standings")
      .select("*"),
  ]);

  // Group rows by group_name, preserving DB sort order (already sorted by pts/gd)
  const grouped = new Map<string, typeof standings>();
  for (const row of standings ?? []) {
    if (!grouped.has(row.group_name)) grouped.set(row.group_name, []);
    grouped.get(row.group_name)!.push(row);
  }

  const groupNames = [...grouped.keys()].sort();

  return (
    <main className="min-h-screen bg-parchment">
      <NavBar
        userId={user.id}
        walletAddress={profile?.wallet_address ?? null}
        activePath="/groups"
        avatarUrl={profile?.avatar_url}
        username={profile?.username}
      />

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-6">

        <div className="flex items-end justify-between">
          <h1 className="font-black text-2xl tracking-tight">Group Phase</h1>
          <p className="font-mono text-[11px] text-ink-muted uppercase tracking-widest">
            Top 2 qualify
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {groupNames.map((name) => (
            <GroupTable
              key={name}
              groupName={name}
              rows={grouped.get(name) ?? []}
            />
          ))}
        </div>

      </div>
    </main>
  );
}
