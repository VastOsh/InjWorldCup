"use client";

import { motion } from "framer-motion";

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
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-xs font-mono tracking-[0.25em] uppercase text-accent"
        >
          World Cup 2026
        </motion.p>

        {/* Title */}
        <div className="flex flex-col gap-2">
          <h1 className="text-[clamp(3rem,10vw,7rem)] font-black leading-none tracking-[-0.04em] text-white">
            INJ
          </h1>
          <h1 className="text-[clamp(3rem,10vw,7rem)] font-black leading-none tracking-[-0.04em] text-accent">
            WORLD
          </h1>
          <h1 className="text-[clamp(3rem,10vw,7rem)] font-black leading-none tracking-[-0.04em] text-white">
            CUP
          </h1>
        </div>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="text-sm text-white/50 tracking-wide max-w-xs"
        >
          Predict exact scores. Earn points. Claim the top spot on chain.
        </motion.p>

        {/* CTA */}
        <motion.a
          href="/auth/signin"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.25 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-3 border-2 border-white bg-white px-8 py-3.5 font-bold text-ink text-sm tracking-wide transition-colors hover:bg-accent hover:border-accent hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
          Sign in with Discord
        </motion.a>
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
