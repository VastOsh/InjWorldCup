import { ImageResponse } from "next/og";
import { getStandingBySlug, totalPlayerCount } from "@/lib/podium";
import { OG_SIZE, fallbackCard, ogFonts, resultCard } from "@/lib/resultCard";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "InjWorldCup 2026 final result";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [standing, fonts] = await Promise.all([getStandingBySlug(slug), ogFonts()]);

  if (!standing) {
    return new ImageResponse(fallbackCard(), { ...OG_SIZE, fonts });
  }

  const playerCount = await totalPlayerCount();
  return new ImageResponse(resultCard(standing, playerCount), { ...OG_SIZE, fonts });
}
