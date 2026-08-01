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
    .select("username, avatar_url, total_points, wallet_address, country")
    .eq("id", user.id)
    .single();

  return (
    <main className="grain relative min-h-screen overflow-hidden bg-nightfall text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="aurora aurora-a" />
      </div>

      <NavBar
        userId={user.id}
        walletAddress={profile?.wallet_address ?? null}
        activePath="/profile"
      />

      <div className="relative z-10 mx-auto max-w-lg px-4 py-10 flex flex-col gap-6">
        <h1 className="font-black text-2xl tracking-tight">Profile</h1>

        <ProfileForm
          currentUsername={profile?.username ?? ""}
          currentCountry={profile?.country ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          totalPoints={profile?.total_points ?? 0}
        />
      </div>
    </main>
  );
}
