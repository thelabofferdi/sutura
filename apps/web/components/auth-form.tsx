"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { Check, Eye, EyeOff } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const promises = ["Teste avant de produire", "Ton audience répond sans compte", "Des décisions claires, chiffrées"];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { signIn } = useAuthActions();
  const upsertProfile = useMutation(api.profiles.upsert);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = mode === "login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get("email")); const password = String(form.get("password"));
      await signIn("password", { email, password, flow: login ? "signIn" : "signUp" });
      if (!login) {
        const profile = { name: String(form.get("name")), brandName: String(form.get("brandName")), city: String(form.get("city") || "") || undefined, country: String(form.get("country") || "") || undefined };
        try {
          await upsertProfile(profile);
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes("connecté")) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            await upsertProfile(profile);
          } else throw cause;
        }
      }
      router.push("/dashboard");
    } catch {
      setError(login ? "Email ou mot de passe incorrect. Réessaie." : "Impossible de créer ton espace. Vérifie tes informations.");
    } finally { setLoading(false); }
  }

  return <main className="flex min-h-screen bg-canvas">
    <aside className="relative hidden w-[46%] overflow-hidden bg-prune lg:block"><Image src="/brand/hero-visual.jpg" alt="Atelier de couture" fill priority sizes="46vw" className="object-cover opacity-90"/><div className="absolute inset-0 bg-gradient-to-t from-prune via-prune/35 to-prune/10"/><div className="relative flex h-full flex-col justify-between p-10 xl:p-14"><Link href="/"><Image src="/brand/wordmark-framboise.png" alt="Sutura" width={120} height={38} className="brightness-0 invert" style={{width:"auto"}}/></Link><div><p className="t-eyebrow text-jaune">Atelier de décisions</p><p className="display-font mt-5 max-w-md text-5xl font-semibold leading-[1.02] text-white">Crée, teste et décide avec plus de clarté.</p><ul className="mt-8 space-y-3">{promises.map(item=><li key={item} className="flex items-center gap-3 text-sm font-semibold text-white/85"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-framboise"><Check className="h-3.5 w-3.5"/></span>{item}</li>)}</ul></div></div></aside>
    <section className="flex w-full flex-col px-5 py-6 sm:px-10 lg:w-[54%] lg:justify-center lg:px-16 xl:px-24"><div className="mx-auto w-full max-w-md"><Link href="/" className="lg:hidden"><Image src="/brand/wordmark-framboise.png" alt="Sutura" width={108} height={34} priority style={{width:"auto"}}/></Link><div className="mt-10 lg:mt-0"><p className="t-eyebrow text-framboise">{login?"Ton atelier":"Bienvenue"}</p><h1 className="t-display-lg mt-4 text-prune">{login?"Ravi de te revoir.":"Créer mon espace."}</h1><p className="mt-4 text-sm text-prune/65">{login?"Retrouve tes collections et continue tes décisions.":"Un espace simple pour tester tes idées avant de produire."}</p><form onSubmit={handleSubmit} className="mt-9 space-y-5">{!login&&<div className="grid gap-5 sm:grid-cols-2"><TextField label="Nom complet" required name="name" autoComplete="name"/><TextField label="Nom de la marque" required name="brandName" autoComplete="organization"/></div>}<TextField label="Adresse email" required name="email" type="email" autoComplete="email"/><div className="relative"><TextField label="Mot de passe" required name="password" type={showPassword?"text":"password"} minLength={8} autoComplete={login?"current-password":"new-password"}/><button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute bottom-3 right-3 text-prune/45">{showPassword?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div>{!login&&<div className="grid gap-5 sm:grid-cols-2"><TextField label="Ville" optional name="city"/><TextField label="Pays" optional name="country"/></div>}{login&&<div className="text-right"><Link href="/forgot-password" className="text-xs font-bold text-framboise">Mot de passe oublié ?</Link></div>}{error&&<p role="alert" className="rounded-[14px] bg-error-clair px-4 py-3 text-sm font-semibold text-error">{error}</p>}<Button type="submit" disabled={loading} className="w-full">{loading?"Un instant…":login?"Se connecter":"Créer mon atelier"}</Button></form><p className="mt-7 text-center text-sm text-prune/60">{login?"Pas encore de compte ? ":"Tu as déjà un compte ? "}<Link href={login?"/register":"/login"} className="font-bold text-framboise">{login?"Créer mon espace":"Se connecter"}</Link></p></div></div></section>
  </main>;
}
