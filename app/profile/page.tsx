import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import ProfileForm from "@/app/components/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url, total_points, wallet_address")
    .eq("id", user.id)
    .single();

  return (
    <main className="min-h-screen bg-parchment">
      <NavBar
        userId={user.id}
        walletAddress={profile?.wallet_address ?? null}
        activePath="/profile"
      />

      <div className="mx-auto max-w-lg px-4 py-8 flex flex-col gap-6">
        <h1 className="font-black text-2xl tracking-tight">Profile</h1>

        <ProfileForm
          currentUsername={profile?.username ?? ""}
          avatarUrl={profile?.avatar_url ?? null}
          totalPoints={profile?.total_points ?? 0}
        />
      </div>
    </main>
  );
}
