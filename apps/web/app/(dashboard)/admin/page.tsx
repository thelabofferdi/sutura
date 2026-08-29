"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const steps = ["generateQuestions", "recommendations", "copilot", "detectInconsistencies", "summarizeResponses", "assistantLaunch"] as const;
const IMPLEMENTED = new Set<string>(["generateQuestions", "recommendations"]);
type PipelineConfig = { step: (typeof steps)[number]; enabled: boolean; provider: "local" | "imole" | "auto"; model: string; baseUrl?: string; apiKeyId?: string; promptVersion: string; fallbackToLocal: boolean };
type ApiKey = { _id: Id<"aiApiKeys">; name: string; maskedKey: string; provider: string; isActive: boolean };

export default function AdminPage() {
  const isAdmin = useQuery(api.admin.isAdmin);
  const pipeline = useQuery(api.admin.listPipeline);
  const keys = useQuery(api.admin.listKeys);
  const createKey = useMutation(api.admin.createKey);
  const updateKey = useMutation(api.admin.updateKey);
  const deleteKey = useMutation(api.admin.deleteKey);
  const upsert = useMutation(api.admin.upsertPipeline);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  if (isAdmin === undefined || pipeline === undefined || keys === undefined) return <p className="p-8 text-center">Chargement admin…</p>;
  if (isAdmin === false) return <div className="mx-auto max-w-2xl p-8 text-center"><h1 className="text-xl font-bold">Accès refusé</h1><p className="mt-2 text-sm text-prune/60">Votre email n&apos;est pas autorisé. Ajoutez-le à ADMIN_EMAILS côté Convex.</p></div>;
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <p className="t-eyebrow text-framboise">Admin Sutura</p>
        <h1 className="display-font text-4xl text-prune">Pipeline IA</h1>
        <p className="mt-2 text-sm text-prune/60">Rote les clés Imole et le modèle par étape. Les clés ne sont jamais renvoyées en clair.</p>
      </header>
      {error && <p className="rounded-[12px] bg-error/10 px-4 py-2 text-sm text-error">{error}</p>}
      {info && <p className="rounded-[12px] bg-success-clair px-4 py-2 text-sm text-success">{info}</p>}

      <section className="rounded-[20px] border border-line bg-white p-6">
        <h2 className="font-semibold">Clés API</h2>
        <div className="mt-4 space-y-2">
          {keys.map((k) => (
            <div key={k._id} className="flex flex-col gap-2 rounded-[12px] bg-canvas px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2"><span>{k.name} · {k.maskedKey} · {k.provider} · {k.isActive ? "active" : "inactive"}</span><div className="flex gap-2"><button disabled={pending} onClick={async () => { setError(""); setInfo(""); setPending(true); try { await updateKey({ id: k._id, isActive: !k.isActive }); setInfo("Clé mise à jour"); } catch (e) { setError((e as Error).message); } finally { setPending(false); } }} className="text-framboise disabled:opacity-50">{k.isActive ? "Désactiver" : "Activer"}</button><button disabled={pending} onClick={async () => { if (!confirm("Supprimer cette clé ?")) return; setPending(true); try { await deleteKey({ id: k._id }); setInfo("Clé supprimée"); } catch (e) { setError((e as Error).message); } finally { setPending(false); } }} className="text-error disabled:opacity-50">Supprimer</button></div></div>
              <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget as HTMLFormElement); const v = String(f.get("rotate_" + k._id) ?? "").trim(); if (!v) return; setPending(true); try { await updateKey({ id: k._id, rawKey: v }); setInfo("Clé rotée"); (e.target as HTMLFormElement).reset(); } catch (err) { setError((err as Error).message); } finally { setPending(false); } }} className="flex gap-2"><input name={`rotate_${k._id}`} placeholder="Nouvelle valeur pour rotation" type="password" className="flex-1 rounded-[10px] border border-line bg-white px-2 py-1 text-xs" /><Button type="submit" disabled={pending} className="py-1 text-xs">Roter</Button></form>
            </div>
          ))}
          {keys.length === 0 && <p className="text-xs text-prune/50">Aucune clé. Crée Imole d&apos;abord.</p>}
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setPending(true); setError(""); setInfo(""); try { await createKey({ name: String(f.get("name")), rawKey: String(f.get("rawKey")), provider: String(f.get("provider")) as "imole" | "openai" | "generic" }); e.currentTarget.reset(); setInfo("Clé créée"); } catch (err) { setError((err as Error).message); } finally { setPending(false); } }} className="mt-6 grid gap-3 sm:grid-cols-3">
          <TextField name="name" label="Nom" required placeholder="imole-prod-1" />
          <TextField name="rawKey" label="Clé" required placeholder="sk-..." type="password" />
          <select name="provider" defaultValue="imole" className="rounded-[12px] border border-line bg-canvas px-3 py-2 text-sm"><option value="imole">imole</option><option value="openai">openai</option><option value="generic">generic</option></select>
          <Button type="submit" disabled={pending} className="sm:col-span-3">{pending ? "En cours…" : "Ajouter clé"}</Button>
        </form>
      </section>

      <section className="rounded-[20px] border border-line bg-white p-6">
        <h2 className="font-semibold">Pipeline par étape</h2>
        <p className="text-xs text-prune/50">Active/désactive, choisis provider/model, associe une clé et promptVersion.</p>
        <div className="mt-4 space-y-4">
          {steps.map((step) => {
            const cfg = pipeline.find((c) => c.step === step);
            const implemented = IMPLEMENTED.has(step);
            return <div key={step} className={!implemented ? "opacity-60" : ""}><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] px-2 py-0.5 rounded-full ${implemented ? "bg-success-clair text-success" : "bg-canvas text-prune/60"}`}>{implemented ? "actif" : "à venir"}</span>{!implemented && <span className="text-[11px] text-prune/50">Configuration enregistrée mais non exécutée pour l’instant</span>}</div><PipelineRow step={step} cfg={cfg} keys={keys} upsert={upsert} onError={setError} onInfo={setInfo} /></div>;
          })}
        </div>
      </section>
    </div>
  );
}

function PipelineRow({ step, cfg, keys, upsert, onError, onInfo }: { step: (typeof steps)[number]; cfg: PipelineConfig | undefined; keys: ApiKey[]; upsert: (args: { step: (typeof steps)[number]; enabled: boolean; provider: "local" | "imole" | "auto"; model: string; baseUrl?: string; apiKeyId?: Id<"aiApiKeys"> | null; promptVersion: string; fallbackToLocal: boolean }) => Promise<unknown>; onError: (s: string) => void; onInfo: (s: string) => void }) {
  const [enabled, setEnabled] = useState<boolean>(cfg?.enabled ?? true);
  const [provider, setProvider] = useState<"local" | "imole" | "auto">(cfg?.provider ?? "auto");
  const [model, setModel] = useState<string>(cfg?.model ?? (step === "recommendations" ? "gpt-5.6-luna" : "gpt-5.6-luna"));
  const [baseUrl, setBaseUrl] = useState<string>(cfg?.baseUrl ?? "");
  const [apiKeyId, setApiKeyId] = useState<string>(cfg?.apiKeyId ?? "");
  const [promptVersion, setPromptVersion] = useState<string>(cfg?.promptVersion ?? "1");
  const [fallback, setFallback] = useState<boolean>(cfg?.fallbackToLocal ?? true);
  return (
    <div className="rounded-[16px] border border-line bg-canvas/30 p-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-prune">{step}</h3><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Actif</label></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Provider<select value={provider} onChange={(e) => setProvider(e.target.value as "local" | "imole" | "auto")} className="mt-1 w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-xs"><option value="auto">auto</option><option value="imole">imole</option><option value="local">local</option></select></label>
        <label className="text-xs">Modèle<input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-xs" placeholder="gpt-5.6-luna" /></label>
        <label className="text-xs">Base URL<input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1 w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-xs" placeholder="https://api.imole.app/v1" /></label>
        <label className="text-xs">Clé<select value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} className="mt-1 w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-xs"><option value="">— aucune —</option>{keys.filter((k) => k.isActive).map((k) => <option key={k._id} value={k._id}>{k.name} · {k.maskedKey}</option>)}</select></label>
        <label className="text-xs">Prompt version<input value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} className="mt-1 w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-xs" placeholder="1" /></label>
        <label className="flex items-center gap-1.5 pt-5 text-xs"><input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} /> Fallback local</label>
      </div>
      <Button onClick={async () => { try { await upsert({ step, enabled, provider, model, baseUrl: baseUrl || undefined, apiKeyId: apiKeyId ? (apiKeyId as Id<"aiApiKeys">) : null, promptVersion, fallbackToLocal: fallback }); onInfo(`${step} enregistré`); } catch (e) { onError((e as Error).message); } }} className="mt-3">Enregistrer {step}</Button>
    </div>
  );
}
