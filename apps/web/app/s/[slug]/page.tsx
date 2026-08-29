"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { FashionModel, Question } from "@/lib/types";
import { TurnstileWidget } from "@/components/turnstile";

const labels: Record<string, string> = {
  firstName: "Prénom",
  sex: "Genre",
  age: "Âge",
  city: "Ville",
  country: "Pays",
  whatsapp: "WhatsApp",
  email: "Email",
  profession: "Profession",
};

export default function Page() {
  const p = useParams<{ slug: string }>();
  const slug = Array.isArray(p.slug) ? p.slug[0] : p.slug;
  const test = useQuery(api.publicTests.getBySlug, { slug });
  const submit = useMutation(api.publicTests.submitResponse);
  const [startedAt] = useState(() => Date.now());
  const [key] = useState(() => crypto.randomUUID());
  const [clientKey] = useState(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const stored = window.localStorage.getItem("sutura_public_client_key");
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem("sutura_public_client_key", created);
    return created;
  });
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [respondent, setRespondent] = useState<Record<string, string | number>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [turnstileToken, setTurnstileToken] = useState("");
  const needsTurnstile = Boolean(siteKey);

  const needs = Boolean(test && !test.settings.anonymousResponses && test.settings.collectRespondentProfile.length);
  const total = (test?.questions.length ?? 0) + (needs ? 1 : 0);
  const qi = step - (needs ? 1 : 0);
  const current = qi >= 0 ? test?.questions[qi] : undefined;
  const profile = needs && step === 0;
  const last = step === total - 1;
  const can = useMemo(
    () =>
      step < 0 ||
      profile
        ? !profile || test!.settings.collectRespondentProfile.every((f) => String(respondent[f] ?? "").trim())
        : Boolean(current && ((!current.required && !test!.settings.requireAllQuestions) || has(answers[current.id]))),
    [answers, current, profile, respondent, step, test],
  );

  if (test === undefined) return <State>Chargement…</State>;
  if (!test) return <State>Test introuvable, fermé ou complet.</State>;
  if (done)
    return (
      <State>
        <Check className="mx-auto text-framboise" aria-hidden />
        <h1 className="display-font mt-6 text-5xl">Merci.</h1>
        <p className="mt-4 text-sm leading-6 text-prune/70">{done}</p>
      </State>
    );

  async function finish() {
    if (sending) return;
    if (needsTurnstile && !turnstileToken) { setError("Vérification anti-bot requise. Coche la case."); return; }
    setSending(true);
    setError("");
    try {
      const r = await submit({ testId: test!.id, respondent: needs ? respondent : undefined, answers, startedAt, idempotencyKey: key, clientKey, turnstileToken: needsTurnstile ? turnstileToken : undefined });
      setDone(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-6">
        <Image src="/brand/wordmark-framboise.png" alt="Sutura" width={100} height={32} />
        <small className="text-xs font-semibold text-prune/60" aria-label="Collection">{test.collection.title}</small>
      </header>
      <div className="mx-auto max-w-xl px-5 py-8">
        {step < 0 ? (
          <section aria-labelledby="intro-title">
            <p className="t-eyebrow text-framboise">Questionnaire public</p>
            <h1 id="intro-title" className="display-font mt-4 text-5xl text-prune">{test.title}</h1>
            <p className="mt-5 text-sm leading-7 text-prune/70">{test.description || test.collection.description}</p>
            <div className="mt-6 rounded-[14px] bg-white p-4 text-sm text-prune/60" role="note">
              {test.questions.length} questions · ~2 min · sans création de compte
            </div>
            <button type="button" onClick={() => setStep(0)} className="mt-8 inline-flex items-center gap-2 rounded-[14px] bg-framboise px-6 py-4 text-sm font-bold text-white shadow-framboise transition hover:bg-framboise-fonce" aria-label="Commencer le questionnaire">
              Commencer <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </section>
        ) : (
          <>
            <div className="mb-8" role="progressbar" aria-valuenow={Math.round(((step + 1) / total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progression">
              <div className="flex justify-between text-xs font-semibold text-prune/50">
                <span>Question {step + 1} sur {total}</span>
                <span>{Math.round(((step + 1) / total) * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-pale">
                <div className="h-full bg-framboise transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
              </div>
            </div>
            {profile ? (
              <Profile fields={test.settings.collectRespondentProfile} values={respondent} set={setRespondent} />
            ) : current ? (
              <QuestionStep question={current as Question} value={answers[current.id]} change={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))} />
            ) : null}
            {error && (
              <p className="mt-5 rounded-[12px] border border-error/30 bg-white px-4 py-3 text-sm text-error" role="alert">{error}</p>
            )}
            {needsTurnstile && last && <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />}
            <div className="mt-10 flex items-center justify-between">
              {step > 0 ? (
                <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 text-sm font-semibold text-prune" aria-label="Revenir à la question précédente">
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Retour
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!can || sending}
                onClick={() => (last ? void finish() : setStep((s) => s + 1))}
                className="inline-flex items-center justify-center rounded-[14px] bg-framboise px-6 py-4 text-sm font-bold text-white shadow-framboise transition disabled:opacity-40"
                aria-label={last ? "Envoyer mes réponses" : "Continuer"}
              >
                {sending ? "Envoi…" : last ? "Envoyer" : "Continuer"}
              </button>
            </div>
            {last && !profile && (
              <p className="mt-4 text-center text-xs text-prune/50">Vérifie tes réponses avant d’envoyer. L’envoi est définitif et idempotent.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

type PublicQuestion = Question & { model?: Pick<FashionModel, "name" | "photoUrls"> | null };

function QuestionStep({ question, value, change }: { question: PublicQuestion; value: unknown; change: (v: unknown) => void }) {
  const opts = question.type === "yes_no" ? ["Oui", "Non"] : question.options;
  if (["single_choice", "yes_no"].includes(question.type)) {
    return (
      <Block q={question}>
        <fieldset className="space-y-3" aria-labelledby={`q-${question.id}`}>
          <legend id={`q-${question.id}`} className="sr-only">{question.text}</legend>
          {opts.map((o) => {
            const selected = value === (question.type === "yes_no" ? o === "Oui" : o);
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => change(question.type === "yes_no" ? o === "Oui" : o)}
                className={`flex min-h-[52px] w-full items-center rounded-[16px] border px-4 py-3 text-left text-sm font-medium transition ${selected ? "border-framboise bg-rose-pale text-prune" : "border-line bg-white text-prune/80 hover:border-prune/20"}`}
              >
                {o}
              </button>
            );
          })}
        </fieldset>
      </Block>
    );
  }
  if (question.type === "multiple_choice") {
    return (
      <Block q={question}>
        <fieldset className="space-y-3" aria-labelledby={`q-${question.id}`}>
          <legend id={`q-${question.id}`} className="sr-only">{question.text}</legend>
          {opts.map((o) => {
            const list = Array.isArray(value) ? (value as string[]) : [];
            const checked = list.includes(o);
            return (
              <label key={o} className={`flex min-h-[52px] items-center gap-3 rounded-[16px] border px-4 py-3 text-sm ${checked ? "border-framboise bg-rose-pale" : "border-line bg-white"}`}>
                <input type="checkbox" checked={checked} onChange={() => change(checked ? list.filter((x) => x !== o) : [...list, o])} className="h-4 w-4 accent-framboise" aria-label={o} />
                <span>{o}</span>
              </label>
            );
          })}
        </fieldset>
      </Block>
    );
  }
  if (question.type === "ranking") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    const ordered = [...list, ...opts.filter((option) => !list.includes(option))];
    return (
      <Block q={question}>
        <p className="mb-4 text-sm text-prune/60">Utilise les flèches pour classer les options. L’ordre complet est requis.</p>
        <div className="space-y-3" role="list" aria-label="Classement des options">
          {ordered.map((option, index) => (
            <div key={option} role="listitem" className="flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-framboise text-xs font-bold text-white" aria-hidden>{index + 1}</span>
              <span className="flex-1 text-sm font-medium text-prune">{option}</span>
              <button type="button" aria-label={`Monter ${option}`} disabled={index === 0} onClick={() => { const next = [...ordered]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; change(next); }} className="rounded-full p-2 text-prune disabled:opacity-30" tabIndex={0}>↑</button>
              <button type="button" aria-label={`Descendre ${option}`} disabled={index === ordered.length - 1} onClick={() => { const next = [...ordered]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; change(next); }} className="rounded-full p-2 text-prune disabled:opacity-30" tabIndex={0}>↓</button>
            </div>
          ))}
        </div>
      </Block>
    );
  }
  if (["scale", "rating", "price"].includes(question.type)) {
    const min = question.min ?? 1;
    const max = question.max ?? (question.type === "price" ? 100000 : 5);
    const current = Number(value ?? min);
    return (
      <Block q={question}>
        <label htmlFor={`slider-${question.id}`} className="sr-only">{question.text}</label>
        <input id={`slider-${question.id}`} type="range" min={min} max={max} value={current} onChange={(e) => change(Number(e.target.value))} className="w-full accent-framboise" aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-label={question.text} />
        <p className="mt-4 text-center text-3xl font-semibold text-prune" aria-live="polite">{current.toLocaleString("fr-FR")}</p>
        <p className="mt-1 text-center text-xs text-prune/50">{min.toLocaleString("fr-FR")} – {max.toLocaleString("fr-FR")}</p>
      </Block>
    );
  }
  return (
    <Block q={question}>
      {question.type === "paragraph" ? (
        <textarea rows={5} value={String(value ?? "")} onChange={(e) => change(e.target.value)} placeholder="Ta réponse…" maxLength={5000} className="w-full rounded-[14px] border border-line bg-white p-4 text-sm outline-none focus:border-framboise" aria-label={question.text} />
      ) : (
        <input value={String(value ?? "")} onChange={(e) => change(e.target.value)} placeholder="Ta réponse…" maxLength={500} className="w-full rounded-[14px] border border-line bg-white p-4 text-sm outline-none focus:border-framboise" aria-label={question.text} />
      )}
      <p className="mt-2 text-right text-xs text-prune/40">{String(value ?? "").length} caractères</p>
    </Block>
  );
}

function Block({ q, children }: { q: PublicQuestion; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`q-title-${q.id}`}>
      {q.model?.photoUrls[0] ? (
        <Image src={q.model.photoUrls[0]} alt={q.model.name} width={720} height={480} className="mb-6 aspect-[4/3] w-full rounded-[20px] object-cover" />
      ) : null}
      {!q.model?.photoUrls[0] && q.model ? (
        <div className="mb-6 grid aspect-[4/3] place-items-center rounded-[20px] bg-rose-pale text-sm text-prune/50">Image indisponible · {q.model.name}</div>
      ) : null}
      <p className="t-eyebrow text-framboise">Question {q.required ? "· requise" : "· optionnelle"}</p>
      <h1 id={`q-title-${q.id}`} className="display-font mt-3 text-3xl leading-8 text-prune">{q.text}</h1>
      {q.helpText && <p className="mt-2 text-sm leading-6 text-prune/60">{q.helpText}</p>}
      {q.model && <p className="mt-2 text-xs font-semibold text-prune/50">Modèle : {q.model.name}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Profile({ fields, values, set }: { fields: string[]; values: Record<string, string | number>; set: React.Dispatch<React.SetStateAction<Record<string, string | number>>> }) {
  return (
    <section aria-labelledby="profile-title">
      <h1 id="profile-title" className="display-font text-4xl text-prune">À propos de toi.</h1>
      <p className="mt-2 text-sm text-prune/60">Ces informations aident le créateur à comprendre son audience. Elles ne seront jamais transmises à l’IA.</p>
      <div className="mt-8 grid gap-4">
        {fields.map((f) => (
          <label key={f} className="block text-sm font-semibold text-prune">
            {labels[f] ?? f} <span className="text-framboise">*</span>
            <input value={values[f] ?? ""} onChange={(e) => set((v) => ({ ...v, [f]: e.target.value }))} className="mt-2 block w-full rounded-[14px] border border-line bg-white px-4 py-3 text-sm font-normal outline-none focus:border-framboise" required aria-required="true" aria-label={labels[f] ?? f} />
          </label>
        ))}
      </div>
    </section>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-5">
      <div className="max-w-md rounded-[24px] border border-line bg-white p-8 text-center">{children}</div>
    </main>
  );
}

function has(v: unknown) {
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "";
}
