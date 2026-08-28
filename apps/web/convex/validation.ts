import type { Doc } from "./_generated/dataModel";

export const QUESTION_TYPES = [
  "single_choice", "multiple_choice", "scale", "rating", "yes_no",
  "price", "short_text", "paragraph", "ranking",
] as const;

const PROFILE_FIELDS = new Set(["firstName", "sex", "age", "city", "country", "whatsapp", "email", "profession"]);

type Question = Pick<Doc<"questions">, "_id" | "text" | "type" | "required" | "options" | "min" | "max">;
type Settings = Pick<Doc<"fashionTests">, "settings">["settings"];

function fail(message: string): never { throw new Error(message); }

export function validateQuestionDefinition(args: { text: string; type: string; options: string[]; min?: number; max?: number }) {
  const text = args.text.trim();
  if (!text) fail("La question est requise.");
  if (!(QUESTION_TYPES as readonly string[]).includes(args.type)) fail("Type de question invalide.");
  const options = [...new Set(args.options.map(option => option.trim()).filter(Boolean))];
  if (["single_choice", "multiple_choice", "ranking"].includes(args.type) && options.length < 2) fail("Ajoutez au moins deux options distinctes.");
  if (!["single_choice", "multiple_choice", "ranking"].includes(args.type) && options.length) fail("Ce type de question n'accepte pas d'options.");
  if (["scale", "rating", "price"].includes(args.type)) {
    if (args.min === undefined || args.max === undefined || !Number.isFinite(args.min) || !Number.isFinite(args.max) || args.min >= args.max) fail("Les bornes de la question sont invalides.");
  } else if (args.min !== undefined || args.max !== undefined) fail("Les bornes ne sont valables que pour une question numérique.");
  return { text, options, min: args.min, max: args.max };
}

function hasValue(value: unknown) { return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== ""; }

const MAX_TEXT_SHORT = 500;
const MAX_TEXT_PARAGRAPH = 5000;
const MAX_ANSWERS_JSON = 50 * 1024;

export function validatePublicSubmission(questions: Question[], settings: Settings, answers: unknown, respondent: unknown, idempotencyKey: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) fail("Clé de soumission invalide.");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) fail("Les réponses sont invalides.");
  // Garde-fou volume global
  try {
    const json = JSON.stringify(answers);
    if (json.length > MAX_ANSWERS_JSON) fail("Réponses trop volumineuses.");
  } catch {
    fail("Réponses invalides.");
  }
  const answerMap = answers as Record<string, unknown>;
  const knownIds = new Set(questions.map(question => String(question._id)));
  if (Object.keys(answerMap).some(id => !knownIds.has(id))) fail("Une question envoyée n'existe pas dans ce test.");

  const profileFields = Array.isArray(settings.collectRespondentProfile)
    ? settings.collectRespondentProfile
    : settings.collectRespondentProfile ? ["firstName", "city", "country"] : [];
  if (profileFields.some(field => !PROFILE_FIELDS.has(field))) fail("Champ de profil invalide.");
  if (settings.anonymousResponses && respondent !== undefined) fail("Ce test n'accepte pas de profil répondant.");
  if (!settings.anonymousResponses) {
    if (!respondent || typeof respondent !== "object" || Array.isArray(respondent)) fail("Le profil répondant est requis.");
    const profile = respondent as Record<string, unknown>;
    if (Object.keys(profile).some(field => !profileFields.includes(field))) fail("Champ de profil non autorisé.");
    if (profileFields.some(field => !hasValue(profile[field]))) fail("Tous les champs du profil sont requis.");
  }

  for (const question of questions) {
    const value = answerMap[String(question._id)];
    if ((question.required || settings.requireAllQuestions) && !hasValue(value)) fail(`Réponse requise : ${question.text}`);
    if (!hasValue(value)) continue;
    const options = question.options;
    if (question.type === "single_choice") {
      if (typeof value !== "string" || !options.includes(value)) fail(`Réponse invalide : ${question.text}`);
    } else if (["multiple_choice", "ranking"].includes(question.type)) {
      if (!Array.isArray(value) || value.length !== new Set(value).size || value.some(item => typeof item !== "string" || !options.includes(item))) fail(`Réponse invalide : ${question.text}`);
      if (question.type === "ranking" && value.length !== options.length) fail(`Classement incomplet : ${question.text}`);
    } else if (question.type === "yes_no") {
      if (typeof value !== "boolean") fail(`Réponse invalide : ${question.text}`);
    } else if (["scale", "rating", "price"].includes(question.type)) {
      const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
      if (!Number.isFinite(numeric) || (question.min !== undefined && numeric < question.min) || (question.max !== undefined && numeric > question.max)) fail(`Valeur invalide : ${question.text}`);
    } else if (typeof value !== "string") {
      fail(`Réponse invalide : ${question.text}`);
    }
    // Limites texte (évite payload anormalement grand)
    if (typeof value === "string") {
      const max = question.type === "paragraph" ? MAX_TEXT_PARAGRAPH : question.type === "short_text" ? MAX_TEXT_SHORT : 240;
      if (value.length > max) fail(`Réponse trop longue : ${question.text}`);
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.length > 240) fail(`Réponse trop longue : ${question.text}`);
      }
    }
  }
}
