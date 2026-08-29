"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
export default function ForgotPassword() {
  const { signIn } = useAuthActions();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    if (!email.includes("@")) { setError("Email invalide."); return; }
    setLoading(true);
    try {
      await signIn("password", { flow: "reset", email });
      setDone(true);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "Envoi impossible.";
      // Ne pas révéler l'existence du compte — message générique
      if (msg.includes("Invalid")) setDone(true);
      else setError(msg);
    } finally { setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas p-5"><form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-[24px] border border-line bg-white p-8 shadow-lift"><p className="t-eyebrow text-framboise">Accès à ton atelier</p><h1 className="display-font text-4xl font-semibold text-prune">Mot de passe oublié.</h1><p className="text-sm leading-6 text-prune/60">Entre ton email. Si le compte existe, tu recevras un lien de réinitialisation.</p>{done ? <p role="status" className="rounded-[14px] bg-success-clair p-4 text-sm font-semibold text-success">Si le compte existe, un email a été envoyé. Vérifie ta boîte (pense aux spams).</p> : <><TextField label="Adresse email" name="email" type="email" required autoComplete="email" />{error && <p role="alert" className="rounded-[12px] bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}<Button className="w-full" disabled={loading}>{loading ? "Envoi…" : "Envoyer le lien"}</Button></>}<Link href="/login" className="block text-center text-sm font-bold text-framboise">Retour à la connexion</Link></form></main>;
}
