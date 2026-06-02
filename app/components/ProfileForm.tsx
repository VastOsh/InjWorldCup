"use client";

import Image from "next/image";

type Props = {
  currentUsername: string;
  avatarUrl: string | null;
  totalPoints: number;
};

export default function ProfileForm({ currentUsername, avatarUrl, totalPoints }: Props) {
  return (
    <div className="flex flex-col gap-8">

      {/* Avatar + stats */}
      <div className="flex items-center gap-6 border-2 border-ink bg-surface px-6 py-5 shadow-brutal">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={currentUsername}
            width={72}
            height={72}
            className="border-2 border-ink shadow-brutal-sm flex-shrink-0"
          />
        ) : (
          <div className="w-18 h-18 border-2 border-ink bg-parchment flex items-center justify-center text-2xl font-black">
            {currentUsername[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-black text-xl tracking-tight">{currentUsername}</p>
          <p className="font-mono text-sm text-ink-muted mt-0.5">{totalPoints.toLocaleString()} pts</p>
          <p className="font-mono text-[11px] text-ink-faint mt-1 tracking-wide">
            Avatar &amp; name synced from Discord
          </p>
        </div>
      </div>

    </div>
  );
}
