"use client";

import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import WalletSignIn from "@/app/auth/WalletSignIn";

function ErrorBanner() {
  const params = useSearchParams();
  if (!params.get("error")) return null;
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-xs font-mono text-red-400 bg-red-900/30 border border-red-500/40 px-4 py-2 rounded"
    >
      Sign-in failed. Please try again or use a different browser.
    </motion.p>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-stadium px-4">

      {/* Noise texture overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 flex flex-col items-center gap-10 text-center"
      >
        <Suspense fallback={null}><ErrorBanner /></Suspense>

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-xs font-mono tracking-[0.25em] uppercase text-accent"
        >
          Prediction Markets
        </motion.p>

        {/* Title */}
        <div className="flex flex-col gap-2">
          <h1 className="text-[clamp(3.5rem,12vw,8rem)] font-black leading-none tracking-[-0.04em] text-white">
            INJ<span className="text-accent">CUP</span>
          </h1>
        </div>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="text-sm text-white/50 tracking-wide max-w-xs"
        >
          Back an outcome. Split the pot. Settled on Injective.
        </motion.p>

        {/* Wallet sign-in */}
        <WalletSignIn />
      </motion.div>

      {/* Bottom rule */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute bottom-8 text-xs text-white/20 font-mono tracking-widest"
      >
        Created by S!G
      </motion.p>
    </main>
  );
}
