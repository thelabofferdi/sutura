import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";

export type DbCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const id = (await ctx.auth.getUserIdentity())?.subject;
  if (!id) throw new Error("Vous devez être connecté.");
  return id;
}

export async function requireAdmin(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string; email?: string | null; emailVerified?: boolean | null; name?: string | null } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Vous devez être connecté.");
  const email = (identity.email ?? "").toLowerCase().trim();
  if (!email) throw new Error("Accès admin requis. Email manquant.");
  // Exiger email vérifié si le provider le fournit
  if (identity.emailVerified === false) throw new Error("Votre email doit être vérifié pour accéder à l'admin.");
  const rawAllow = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "";
  const allowList = rawAllow.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowList.length === 0) throw new Error("Accès admin non configuré. Définissez ADMIN_EMAILS côté Convex.");
  if (allowList.includes(email)) return identity.subject;
  throw new Error("Accès admin requis. Votre email n'est pas autorisé.");
}

export async function isAdminEmail(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string; email?: string | null; emailVerified?: boolean | null } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const email = (identity.email ?? "").toLowerCase().trim();
  if (!email) return false;
  const rawAllow = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "";
  const allowList = rawAllow.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowList.includes(email);
}

export function publicSettings(settings: Doc<"fashionTests">["settings"]) {
  const fields = Array.isArray(settings.collectRespondentProfile)
    ? settings.collectRespondentProfile
    : settings.collectRespondentProfile
      ? ["firstName", "city", "country"]
      : [];
  return {
    randomizeQuestions: settings.randomizeQuestions ?? false,
    requireAllQuestions: settings.requireAllQuestions ?? false,
    completionMessage: settings.completionMessage ?? "Merci, ta réponse a bien été enregistrée.",
    closesAt: settings.closesAt ? new Date(settings.closesAt).toISOString() : undefined,
    maxResponses: settings.maxResponses,
    anonymousResponses: settings.anonymousResponses,
    collectRespondentProfile: fields,
  };
}

export function publicQuestion(question: Doc<"questions">) {
  return { ...question, id: question._id };
}

export async function assertOwnedTest(ctx: DbCtx, id: Id<"fashionTests">, userId: string) {
  const test = await ctx.db.get(id);
  if (!test || test.creatorId !== userId) throw new Error("Test introuvable.");
  return test;
}

export async function assertOwnedCollection(ctx: DbCtx, id: Id<"collections">, userId: string) {
  const collection = await ctx.db.get(id);
  if (!collection || collection.creatorId !== userId) throw new Error("Collection introuvable.");
  return collection;
}
