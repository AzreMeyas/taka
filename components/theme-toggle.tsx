"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

const NEXT: Record<Mode, Mode> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const GLYPH: Record<Mode, string> = { system: "◐", light: "☀", dark: "☾" };
const TITLE: Record<Mode, string> = {
  system: "Following your device",
  light: "Always light",
  dark: "Always dark",
};

/**
 * Three states, not two: "system" is the default and must stay reachable,
 * otherwise the first tap locks you out of following the device.
 *
 * The attribute is applied by an inline script in the layout before paint;
 * this component only keeps it in sync afterwards.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("taka-theme") as Mode | null;
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {
      // Private mode or blocked storage — stay on system.
    }
  }, []);

  function cycle() {
    const next = NEXT[mode];
    setMode(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem("taka-theme");
      else localStorage.setItem("taka-theme", next);
    } catch {
      // Not persisting is survivable; the page still looks right.
    }
  }

  return (
    <button
      onClick={cycle}
      title={TITLE[mode]}
      aria-label={TITLE[mode]}
      className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-small text-muted transition-colors hover:text-text"
    >
      {GLYPH[mode]}
    </button>
  );
}
