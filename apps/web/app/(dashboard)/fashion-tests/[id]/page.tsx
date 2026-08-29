"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { BarChart3, ChevronDown, ChevronLeft, ChevronUp, Copy, ExternalLink, Plus, Send, Sparkles, Trash2, XCircle, AlertCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { QuestionType } from "@/lib/types";

const types: Array<{ value: QuestionType; label: string }> = [
  { value: "single_choice", label: "Choix unique" },
  { value: "multiple_choice", label: "Choix multiple" },
  { value: "rating", label: "Note /5" },
  { value: "yes_no", label: "Oui / non" },
  { value: "price", label: "Prix" },
  { value: "short_text", label: "Réponse courte" },
  { value: "paragraph", label: "Texte long" },
  { value: "ranking", label: "Classement" },
  { value: "scale", label: "Échelle" },
];

type EditableQuestion = {
  id: Id<"questions">;
  text: string;
  type: string;
  required: boolean;
  options: string[];
  min?: number;
  max?: number;
  helpText?: string;
};

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) as Id<"fashionTests">;
  const test = useQuery(api.fashionTests.get, { id });
  const publish = useMutation(api.fashionTests.publish);
  const close = useMutation(api.fashionTests.close);
  const duplicate = useMutation(api.fashionTests.duplicate);
  const remove = useMutation(api.fashionTests.removeQuestion);
  const reorder = useMutation(api.fashionTests.reorderQuestions);
  const previewQuestions = useAction(api.questionGeneration.preview);
  const addQuestion = useMutation(api.fashionTests.addQuestion);
  const [editing, setEditing] = useState<EditableQuestion | undefined>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [preview, setPreview] = useState<{ questions: Array<{ text: string; type: string; required: boolean; options: string[]; min?: number; max?: number; helpText?: string; modelId?: string }>; provider: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  if (test === undefined) return <p className="p-8 text-center text-prune/60">Chargement…</p>;
  if (!test) return <p className="p-8 text-center text-error">Test introuvable.</p>;

  const draft = test.status === "draft";
  const questions = test.questions as EditableQuestion[];
  const canPublish = test.modelsCount > 0 && questions.length > 0;
  const publishDisabledReason = !canPublish ? `Ajoute ${test.modelsCount === 0 ? "un modèle" : ""}${test.modelsCount === 0 && questions.length === 0 ? " et " : ""}${questions.length === 0 ? "une question" : ""} avant de publier.` : undefined;

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const questionIds = questions.map(question => question.id);
    [questionIds[index], questionIds[target]] = [questionIds[target], questionIds[index]];
    try {
      await reorder({ testId: id, questionIds });
    } catch (cause) {
      setError(msg(cause));
    }
  };

  const handlePublish = async () => {
    setError("");
    if (!canPublish) {
      setError(publishDisabledReason ?? "Ajoutez au moins un modèle et une question.");
      return;
    }
    try {
      await publish({ id });
    } catch (cause) {
      const message = msg(cause);
      if (message.includes("date de fermeture")) setError("La date de fermeture est passée. Corrige-la dans Réglages avant de publier.");
      else setError(message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/fashion-tests" className="inline-flex items-center gap-1.5 text-sm font-medium text-prune/60 hover:text-prune"><ChevronLeft className="h-4 w-4" />Tests</Link>
      
      <header className="rounded-[24px] bg-prune p-6 text-white sm:p-7">
        <p className="t-eyebrow text-jaune">{draft ? "Brouillon" : test.status === "published" ? "En collecte" : "Fermé"}</p>
        <h1 className="display-font mt-3 text-4xl leading-none sm:text-5xl">{test.title}</h1>
        {test.description && <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">{test.description}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {draft ? (
            <button onClick={handlePublish} disabled={!canPublish} title={publishDisabledReason} className="inline-flex items-center gap-2 rounded-full bg-framboise px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-framboise-fonce disabled:opacity-40 disabled:cursor-not-allowed"><Send className="h-4 w-4" />Publier</button>
          ) : test.status === "published" ? (
            <>
              <Link href={`/s/${test.slug}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-prune"><ExternalLink className="h-4 w-4" />Lien public</Link>
              <button onClick={() => close({ id }).catch(cause => setError(msg(cause)))} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"><XCircle className="h-4 w-4" />Fermer</button>
            </>
          ) : null}
          <Link href={`/analytics/${id}`} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"><BarChart3 className="h-4 w-4" />Analyses</Link>
          <button onClick={async () => { try { const nid = await duplicate({ id }); router.push(`/fashion-tests/${nid}`); } catch (cause) { setError(msg(cause)); } }} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10"><Copy className="h-3.5 w-3.5" />Dupliquer</button>
        </div>
        {!canPublish && draft && <p className="mt-3 flex items-center gap-1.5 text-xs text-jaune"><AlertCircle className="h-3.5 w-3.5" />{publishDisabledReason}</p>}
      </header>

      {error && <div role="alert" className="flex gap-3 rounded-[16px] border border-error/20 bg-error/5 px-4 py-3 text-sm text-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <section className="rounded-[20px] border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <div><h2 className="text-base font-semibold text-prune">Questions</h2><p className="text-xs text-prune/50">{questions.length} question{questions.length !== 1 ? "s" : ""}</p></div>
          {draft && <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-framboise hover:bg-rose-pale"><Plus className="h-3.5 w-3.5" />Ajouter</button>}
        </div>
        {questions.length === 0 ? (
          <div className="mt-6 rounded-[16px] border border-dashed border-line bg-canvas/50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-prune">Aucune question</p>
            <p className="mt-1 text-xs text-prune/50">Ajoute une question pour pouvoir publier.</p>
            {draft && <div className="mt-4 flex justify-center gap-2"><button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full bg-framboise px-4 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" />Première question</button><button disabled={previewLoading} onClick={async () => { setPreviewLoading(true); setError(""); try { const p = await previewQuestions({ testId: id }); setPreview(p); } catch (cause) { setError(msg(cause)); } finally { setPreviewLoading(false); } }} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold text-prune hover:bg-canvas disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{previewLoading ? "Génération…" : "Générer 3 questions"}</button></div>}
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {questions.map((question, index) => (
              <article key={question.id} className="flex gap-3 rounded-[16px] border border-line bg-canvas/30 p-4 transition hover:bg-white">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-prune text-xs font-bold text-white">{index + 1}</span>
                <div className="min-w-0 flex-1"><button disabled={!draft} onClick={() => setEditing(question)} className="w-full text-left disabled:cursor-default"><p className="truncate text-sm font-semibold text-prune">{question.text}</p><p className="mt-1 text-xs text-prune/50">{types.find(t => t.value === question.type)?.label} · {question.required ? "obligatoire" : "facultative"}</p></button></div>
                {draft && <div className="flex items-center gap-1"><button aria-label="Monter" disabled={index === 0} onClick={() => moveQuestion(index, -1)} className="rounded-full p-1.5 text-prune/40 hover:bg-canvas hover:text-prune disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button aria-label="Descendre" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} className="rounded-full p-1.5 text-prune/40 hover:bg-canvas hover:text-prune disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button aria-label="Modifier" onClick={() => setEditing(question)} className="rounded-full p-1.5 text-prune/40 hover:bg-canvas hover:text-prune"><Sparkles className="h-3.5 w-3.5" /></button><button aria-label="Supprimer" onClick={() => remove({ testId: id, questionId: question.id }).catch(cause => setError(msg(cause)))} className="rounded-full p-1.5 text-error/60 hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button></div>}
              </article>
            ))}
          </div>
        )}
      </section>

      {draft && (
        <section className="rounded-[20px] border border-line bg-white">
          <button onClick={() => setShowSettings(!showSettings)} className="flex w-full items-center justify-between p-5 text-left">
            <div><h2 className="text-sm font-semibold text-prune">Réglages</h2><p className="text-xs text-prune/50">Collecte, fermeture et message de fin</p></div>
            <ChevronDown className={`h-4 w-4 text-prune/40 transition ${showSettings ? "rotate-180" : ""}`} />
          </button>
          {showSettings && <div className="border-t border-line p-5"><TestSettings testId={id} settings={test.settings} onError={setError} /></div>}
        </section>
      )}

      <div className="flex items-center gap-2 rounded-full bg-canvas px-4 py-2 text-xs font-medium text-prune/60"><Sparkles className="h-3.5 w-3.5 text-framboise" />{test.modelsCount > 0 ? "✓" : "○"} Modèle · {questions.length > 0 ? "✓" : "○"} Question {canPublish ? "— prêt à publier" : ""}</div>

      {adding && <Modal close={() => setAdding(false)}><QuestionForm testId={id} done={() => setAdding(false)} /></Modal>}
      {editing && <Modal close={() => setEditing(undefined)}><QuestionForm testId={id} question={editing} done={() => setEditing(undefined)} /></Modal>}
      {preview && <Modal close={() => setPreview(null)}><div className="space-y-4"><h2 className="display-font text-2xl">Prévisualisation — {preview.provider === "imole" ? "IA" : "local"}</h2><p className="text-xs text-prune/60">Vérifie avant d’ajouter. Tu pourras modifier ensuite.</p><div className="space-y-2">{preview.questions.map((q, i) => <div key={i} className="rounded-[12px] border border-line bg-canvas/30 p-3"><p className="text-sm font-semibold">{i+1}. {q.text}</p><p className="text-xs text-prune/50">{q.type} · {q.required ? "obligatoire" : "facultative"} {q.options.length ? "· " + q.options.join(", ") : ""}</p></div>)}</div><div className="flex gap-2"><Button onClick={async () => { try { for (const q of preview.questions) { await addQuestion({ testId: id, text: q.text, type: q.type, required: q.required, options: q.options, min: q.min, max: q.max, helpText: q.helpText, modelId: q.modelId as unknown as Id<"models"> | undefined }); } setPreview(null); } catch (cause) { setError(msg(cause)); } }} className="flex-1">Ajouter ces {preview.questions.length} questions</Button><button onClick={() => setPreview(null)} className="rounded-full border border-line px-4 py-2 text-sm">Annuler</button></div></div></Modal>}
    </div>
  );
}

type TestSettingsValue = {
  maxResponses?: number;
  closesAt?: string;
  anonymousResponses: boolean;
  collectRespondentProfile: string[];
  randomizeQuestions: boolean;
  requireAllQuestions: boolean;
  completionMessage: string;
};

function TestSettings({ testId, settings, onError }: { testId: Id<"fashionTests">; settings: TestSettingsValue; onError: (message: string) => void }) {
  const update = useMutation(api.fashionTests.updateSettings);
  const profileFields = ["firstName", "city", "country", "email"];
  // eslint-disable-next-line
  const minDate = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const closesAtRaw = String(form.get("closesAt") ?? "");
    if (closesAtRaw) {
      const closesAtMs = new Date(closesAtRaw).getTime();
      // eslint-disable-next-line
      if (closesAtMs <= Date.now()) {
        onError("La date de fermeture doit être dans le futur. Choisis une date à venir.");
        return;
      }
    }
    const selectedProfile = profileFields.filter(field => form.get(`profile-${field}`) === "on");
    try {
      await update({
        id: testId,
        maxResponses: String(form.get("maxResponses") ?? "") ? Number(form.get("maxResponses")) : null,
        closesAt: closesAtRaw ? new Date(closesAtRaw).getTime() : null,
        anonymousResponses: form.get("anonymousResponses") === "on",
        collectRespondentProfile: selectedProfile,
        randomizeQuestions: form.get("randomizeQuestions") === "on",
        requireAllQuestions: form.get("requireAllQuestions") === "on",
        completionMessage: String(form.get("completionMessage") ?? ""),
      });
      onError("");
    } catch (cause) {
      const m = msg(cause);
      if (m.includes("date de fermeture")) onError("La date de fermeture est passée. Choisis une date future (au moins +1h).");
      else onError(m);
    }
  }
  return <form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><TextField label="Limite de réponses" name="maxResponses" type="number" min="1" hint="vide = illimité" optional defaultValue={settings.maxResponses} /><TextField label="Fermeture" name="closesAt" type="datetime-local" hint="vide = jamais" optional min={minDate} defaultValue={settings.closesAt?.slice(0, 16)} /></div><label className="flex items-center gap-2.5 rounded-[12px] bg-canvas px-3 py-2.5 text-sm"><input type="checkbox" name="anonymousResponses" defaultChecked={settings.anonymousResponses} className="accent-framboise" /> Réponses anonymes</label><fieldset className="rounded-[12px] border border-line p-3"><legend className="px-1 text-xs font-semibold text-prune/70">Profil répondant (si non anonyme)</legend><div className="flex flex-wrap gap-3">{profileFields.map(field => <label key={field} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" name={`profile-${field}`} defaultChecked={settings.collectRespondentProfile.includes(field)} className="accent-framboise" /> {field}</label>)}</div></fieldset><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="randomizeQuestions" defaultChecked={settings.randomizeQuestions} className="accent-framboise" /> Mélanger les questions</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="requireAllQuestions" defaultChecked={settings.requireAllQuestions} className="accent-framboise" /> Toutes les questions obligatoires</label><TextAreaField label="Message de fin" name="completionMessage" required defaultValue={settings.completionMessage} /><Button type="submit" className="w-full">Enregistrer les réglages</Button></form>;
}

function QuestionForm({ testId, question, done }: { testId: Id<"fashionTests">; question?: EditableQuestion; done: () => void }) {
  const add = useMutation(api.fashionTests.addQuestion);
  const update = useMutation(api.fashionTests.updateQuestion);
  const [type, setType] = useState<QuestionType>((question?.type as QuestionType | undefined) ?? "single_choice");
  const [error, setError] = useState("");
  const options = ["single_choice", "multiple_choice", "ranking"].includes(type);
  const numeric = ["rating", "price", "scale"].includes(type);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawOptions = String(form.get("options") ?? "");
    const parsedOptions = options ? rawOptions.split(/[\n,]+/).map(value => value.trim()).filter(Boolean) : [];
    if (options && parsedOptions.length < 2) { setError("Ajoute au moins 2 options distinctes — ex: Rouge, Noir (sépare par virgule ou saut de ligne)"); return; }
    if (options && new Set(parsedOptions.map(o => o.toLowerCase())).size !== parsedOptions.length) { setError("Options dupliquées — deux options identiques (casse ignorée)"); return; }
    const payload = { text: String(form.get("text") ?? ""), type, required: form.get("required") === "on", options: parsedOptions, min: numeric ? Number(form.get("min")) : undefined, max: numeric ? Number(form.get("max")) : undefined, helpText: String(form.get("helpText") ?? "").trim() || undefined };
    if (numeric && payload.min !== undefined && payload.max !== undefined && payload.min >= payload.max) { setError("La borne minimum doit être inférieure au maximum"); return; }
    try {
      if (question) await update({ testId, questionId: question.id, ...payload });
      else await add({ testId, ...payload });
      done();
    } catch (cause) {
      const m = msg(cause);
      if (m.includes("deux options distinctes")) setError("Ajoute au moins 2 options distinctes — ex: Rouge, Noir");
      else setError(m);
    }
  }

  return <form onSubmit={submit} className="space-y-4"><h2 className="display-font text-2xl">{question ? "Modifier la question" : "Nouvelle question"}</h2><TextAreaField label="Question" name="text" required placeholder="Ex: Quelle couleur préférez-vous ?" defaultValue={question?.text} /><select value={type} onChange={event => setType(event.target.value as QuestionType)} className="w-full rounded-[14px] border border-line bg-canvas px-4 py-3 text-sm"><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiple</option><option value="rating">Note /5</option><option value="yes_no">Oui / non</option><option value="price">Prix</option><option value="short_text">Réponse courte</option><option value="paragraph">Texte long</option><option value="ranking">Classement</option><option value="scale">Échelle</option></select>{options && <TextAreaField label="Options" name="options" required hint="une par ligne ou par virgule" placeholder={"Rouge\nNoir\nBeige"} defaultValue={question?.options.join("\n")} />}{numeric && <div className="grid grid-cols-2 gap-4"><TextField label="Minimum" name="min" type="number" required defaultValue={question?.min} /><TextField label="Maximum" name="max" type="number" required defaultValue={question?.max} /></div>}<TextField label="Aide" name="helpText" optional placeholder="Ex: Choisis ce qui attire ton regard" defaultValue={question?.helpText} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={question?.required ?? true} className="accent-framboise" /> Obligatoire</label>{error && <p role="alert" className="rounded-[12px] bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}<Button className="w-full">{question ? "Enregistrer" : "Ajouter"}</Button></form>;
}

function Modal({ children, close }: { children: React.ReactNode; close: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-prune/50 p-3 sm:p-4" onMouseDown={event => event.target === event.currentTarget && close()}><div className="w-full max-w-lg rounded-[24px] bg-white p-5 sm:p-6 shadow-xl">{children}</div></div>; }
function msg(error: unknown) { return error instanceof Error ? error.message : "Erreur."; }
