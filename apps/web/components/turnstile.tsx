"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void }) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const scriptId = "cf-turnstile-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const render = () => {
      if (!ref.current || !window.turnstile) return;
      if (idRef.current) window.turnstile.remove(idRef.current);
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) { render(); return; }
    if (existing) { existing.addEventListener("load", render); return () => existing.removeEventListener("load", render); }
    const s = document.createElement("script");
    s.id = scriptId;
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = render;
    document.head.appendChild(s);
    return () => {
      if (idRef.current && window.turnstile) {
        try { window.turnstile.remove(idRef.current); } catch {}
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-4 flex justify-center" />;
}
