"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BarChart3, ChevronDown, ChevronLeft, ChevronUp, ExternalLink, Plus, Send, Sparkles, Trash2, XCircle } from "lucide-react";
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
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) as Id<"fashionTests">;
  const test = useQuery(api.fashionTests.get, { id });
  const publish = useMutation(api.fashionTests.publish);
  const close = useMutation(api.fashionTests.close);
  const remove = useMutation(api.fashionTests.removeQuestion);
  const reorder = useMutation(api.fashionTests.reorderQuestions);
  const [editing, setEditing] = useState<EditableQuestion | undefined>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  if (test === undefined) return <p>Chargement…</p>;
  if (!test) return <p>Test introuvable.</p>;

  const draft = test.status === "draft";
  const questions = test.questions as EditableQuestion[];
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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href="/fashion-tests" className="inline-flex gap-2"><ChevronLeft />Tests</Link>
      <header className="rounded-[24px] bg-prune p-7 text-white">
        <p className="t-eyebrow text-jaune">{draft ? "Brouillon" : test.status === "published" ? "En collecte" : "Fermé"}</p>
        <h1 className="display-font mt-3 text-5xl">{test.title}</h1>
        <div className="mt-7 flex flex-wrap gap-3">
          {draft ? <button onClick={() => publish({ id }).catch(cause => setError(msg(cause)))} className="inline-flex gap-2 bg-framboise p-3"><Send />Publier</button> : test.status === "published" ? <><Link href={`/s/${test.slug}`} className="inline-flex gap-2 bg-white p-3 text-prune"><ExternalLink />Lien public</Link><button onClick={() => close({ id }).catch(cause => setError(msg(cause)))} className="inline-flex gap-2"><XCircle />Fermer</button></> : null}
          <Link href={`/analytics/${id}`} className="inline-flex gap-2"><BarChart3 />Analyses</Link>
        </div>
      </header>

      {error && <p className="text-error">{error}</p>}

      <section>
        <div className="mb-4 flex justify-between">
          <div><h2 className="font-bold">Questions</h2><small>{questions.length} questions</small></div>
          {draft && <button onClick={() => setAdding(true)} className="inline-flex gap-2 text-framboise"><Plus />Ajouter</button>}
        </div>
        <div className="space-y-3">
          {questions.map((question, index) => <article key={question.id} className="flex gap-4 rounded-[18px] border border-line bg-white p-5">
            <span className="display-font text-2xl text-framboise">{index + 1}</span>
            <div className="flex-1"><button disabled={!draft} onClick={() => setEditing(question)} className="text-left disabled:cursor-default"><b>{question.text}</b><small className="block">{types.find(type => type.value === question.type)?.label ?? question.type} · {question.required ? "obligatoire" : "facultative"}</small>{question.helpText && <small className="mt-1 block text-muted">{question.helpText}</small>}</button></div>
            {draft && <div className="flex items-start gap-1"><button aria-label="Monter la question" disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ChevronUp /></button><button aria-label="Descendre la question" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)}><ChevronDown /></button><button aria-label="Modifier la question" onClick={() => setEditing(question)}><Sparkles /></button><button aria-label="Supprimer la question" onClick={() => remove({ testId: id, questionId: question.id }).catch(cause => setError(msg(cause)))}><Trash2 /></button></div>}
          </article>)}
        </div>
      </section>

      {draft && <TestSettings testId={id} settings={test.settings} onError={setError} />}
      <section className="rounded-[20px] bg-rose-clair p-6"><p className="flex gap-2"><Sparkles />Checklist</p><p>{test.modelsCount > 0 ? "✓" : "○"} Un modèle · {questions.length > 0 ? "✓" : "○"} Une question</p></section>
      {adding && <Modal close={() => setAdding(false)}><QuestionForm testId={id} done={() => setAdding(false)} /></Modal>}
      {editing && <Modal close={() => setEditing(undefined)}><QuestionForm testId={id} question={editing} done={() => setEditing(undefined)} /></Modal>}
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const closesAt = String(form.get("closesAt") ?? "");
    const selectedProfile = profileFields.filter(field => form.get(`profile-${field}`) === "on");
    try {
      await update({
        id: testId,
        maxResponses: String(form.get("maxResponses") ?? "") ? Number(form.get("maxResponses")) : null,
        closesAt: closesAt ? new Date(closesAt).getTime() : null,
        anonymousResponses: form.get("anonymousResponses") === "on",
        collectRespondentProfile: selectedProfile,
        randomizeQuestions: form.get("randomizeQuestions") === "on",
        requireAllQuestions: form.get("requireAllQuestions") === "on",
        completionMessage: String(form.get("completionMessage") ?? ""),
      });
    } catch (cause) {
      onError(msg(cause));
    }
  }
  return <section className="rounded-[20px] border border-line bg-white p-6"><div className="mb-5"><h2 className="font-bold">Réglages du test</h2><p className="text-muted">Configurez la collecte avant de publier.</p></div><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><TextField label="Nombre maximum de réponses" name="maxResponses" type="number" min="1" optional defaultValue={settings.maxResponses} /><TextField label="Fermeture" name="closesAt" type="datetime-local" optional defaultValue={settings.closesAt?.slice(0, 16)} /></div><label className="flex gap-3"><input type="checkbox" name="anonymousResponses" defaultChecked={settings.anonymousResponses} /> Réponses anonymes</label><fieldset className="space-y-2"><legend className="font-semibold">Profil répondant</legend>{profileFields.map(field => <label key={field} className="mr-4 inline-flex gap-2"><input type="checkbox" name={`profile-${field}`} defaultChecked={settings.collectRespondentProfile.includes(field)} /> {field}</label>)}</fieldset><label className="flex gap-3"><input type="checkbox" name="randomizeQuestions" defaultChecked={settings.randomizeQuestions} /> Mélanger les questions</label><label className="flex gap-3"><input type="checkbox" name="requireAllQuestions" defaultChecked={settings.requireAllQuestions} /> Rendre toutes les questions obligatoires</label><TextAreaField label="Message de fin" name="completionMessage" required defaultValue={settings.completionMessage} /><Button type="submit">Enregistrer les réglages</Button></form></section>;
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
    const payload = { text: String(form.get("text") ?? ""), type, required: form.get("required") === "on", options: options ? String(form.get("options") ?? "").split(/[\n,]+/).map(value => value.trim()).filter(Boolean) : [], min: numeric ? Number(form.get("min")) : undefined, max: numeric ? Number(form.get("max")) : undefined, helpText: String(form.get("helpText") ?? "").trim() || undefined };
    try {
      if (question) await update({ testId, questionId: question.id, ...payload });
      else await add({ testId, ...payload });
      done();
    } catch (cause) { setError(msg(cause)); }
  }

  return <form onSubmit={submit} className="space-y-5"><h2 className="display-font text-3xl">{question ? "Modifier la question" : "Nouvelle question"}</h2><TextAreaField label="Question" name="text" required defaultValue={question?.text} /><select value={type} onChange={event => setType(event.target.value as QuestionType)} className="mt-2 w-full rounded-[14px] border border-line bg-canvas px-4 py-3 text-sm">{types.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{options && <TextAreaField label="Options" name="options" required hint="une par ligne ou séparées par virgule" placeholder={"Rouge\nNoir\nBeige"} defaultValue={question?.options.join("\n")} />}{numeric && <div className="grid grid-cols-2 gap-4"><TextField label="Minimum" name="min" type="number" required defaultValue={question?.min} /><TextField label="Maximum" name="max" type="number" required defaultValue={question?.max} /></div>}<TextField label="Aide" name="helpText" optional defaultValue={question?.helpText} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={question?.required ?? true} /> Obligatoire</label>{error && <p className="rounded-[12px] bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}<Button className="w-full">{question ? "Enregistrer" : "Ajouter"}</Button></form>;
}

function Modal({ children, close }: { children: React.ReactNode; close: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-prune/50 p-4" onMouseDown={event => event.target === event.currentTarget && close()}><div className="w-full max-w-lg rounded-[24px] bg-white p-6">{children}</div></div>; }
function msg(error: unknown) { return error instanceof Error ? error.message : "Erreur."; }
