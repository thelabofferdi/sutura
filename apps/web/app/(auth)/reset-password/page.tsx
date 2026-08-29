"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
function Form() {
  const params = useSearchParams();
  const code = params.get("code") ?? params.get("token") ?? "";
  const emailParam = params.get("email") ?? "";
  const { signIn } = useAuthActions();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? emailParam).trim().toLowerCase();
    const password = String(f.get("password"));
    const confirm = String(f.get("confirm"));
    const codeValue = String(f.get("code") ?? code).trim();
    if (!email.includes("@")) { setError("Email invalide."); return; }
    if (!codeValue) { setError("Code manquant. Vérifie le lien reçu par email."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    setLoading(true); setError("");
    try {
      await signIn("password", { flow: "reset-verification", email, code: codeValue, newPassword: password });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Lien invalide ou expiré.");
    } finally { setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas p-5"><form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-[24px] border border-line bg-white p-8"><p className="t-eyebrow text-framboise">Sécurité</p><h1 className="display-font text-4xl font-semibold text-prune">Nouveau mot de passe.</h1>{done ? <><p className="rounded-[14px] bg-success-clair p-4 text-sm text-success">Ton mot de passe a été modifié. Tu peux te connecter.</p><Link href="/login" className="block text-center font-bold text-framboise">Se connecter</Link></> : <><TextField label="Adresse email" name="email" type="email" required autoComplete="email" defaultValue={emailParam} /><TextField label="Code reçu par email" name="code" required defaultValue={code} placeholder="Colle le code du lien" /><TextField label="Nouveau mot de passe" name="password" type="password" minLength={8} required /><TextField label="Confirmer" name="confirm" type="password" minLength={8} required />{error && <p role="alert" className="rounded-[12px] bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}<Button className="w-full" disabled={loading}>{loading ? "Enregistrement…" : "Enregistrer"}</Button></>}</form></main>;
}
export default function ResetPassword(){return <Suspense><Form/></Suspense>}
