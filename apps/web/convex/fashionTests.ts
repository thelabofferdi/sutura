import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertOwnedCollection, assertOwnedTest, publicQuestion, publicSettings, requireUserId } from "./lib";
import { validateQuestionDefinition } from "./validation";

async function dto(ctx: QueryCtx, test: Doc<"fashionTests">) {
  const questions = await ctx.db.query("questions").withIndex("by_test", q => q.eq("testId", test._id)).collect();
  const responses = await ctx.db.query("publicResponses").withIndex("by_test", q => q.eq("testId", test._id)).collect();
  const models = await ctx.db.query("models").withIndex("by_collection", q => q.eq("collectionId", test.collectionId)).collect();
  return { ...test, id: test._id, settings: publicSettings(test.settings), questions: questions.sort((a, b) => a.sortOrder - b.sortOrder).map(publicQuestion), responsesCount: responses.length, modelsCount: models.length, createdAt: new Date(test.createdAt).toISOString(), updatedAt: new Date(test.updatedAt).toISOString(), publicUrl: null };
}

export const list = query({ args: {}, handler: async ctx => {
  const user = await requireUserId(ctx);
  const rows = await ctx.db.query("fashionTests").withIndex("by_creator", q => q.eq("creatorId", user)).order("desc").collect();
  return Promise.all(rows.map(row => dto(ctx, row)));
} });

export const get = query({ args: { id: v.id("fashionTests") }, handler: async (ctx, { id }) => {
  const user = await requireUserId(ctx);
  return dto(ctx, await assertOwnedTest(ctx, id, user));
} });

export const create = mutation({ args: { collectionId: v.id("collections"), title: v.string(), description: v.optional(v.string()) }, handler: async (ctx, args) => {
  const creatorId = await requireUserId(ctx);
  await assertOwnedCollection(ctx, args.collectionId, creatorId);
  const title = args.title.trim();
  if (!title) throw new Error("Le titre du test est requis.");
  if (title.length > 120) throw new Error("Le titre du test est trop long.");
  if (args.description !== undefined && args.description.trim().length > 2000) throw new Error("La description est trop longue.");
  const base = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test";
  const now = Date.now();
  return ctx.db.insert("fashionTests", { collectionId: args.collectionId, title, description: args.description?.trim() || undefined, creatorId, slug: `${base}-${now.toString(36)}`, status: "draft", settings: { anonymousResponses: true, collectRespondentProfile: [], randomizeQuestions: false, requireAllQuestions: false, completionMessage: "Merci, ta réponse a bien été enregistrée." }, createdAt: now, updatedAt: now });
} });

export const update = mutation({ args: { id: v.id("fashionTests"), title: v.optional(v.string()), description: v.optional(v.string()) }, handler: async (ctx, { id, ...patch }) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, id, user);
  if (test.status !== "draft") throw new Error("Un test publié ne peut plus être modifié.");
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("Le titre du test est requis.");
    if (t.length > 120) throw new Error("Le titre du test est trop long.");
    updates.title = t;
  }
  if (patch.description !== undefined) {
    if (patch.description.trim().length > 2000) throw new Error("La description est trop longue.");
    updates.description = patch.description.trim() || undefined;
  }
  await ctx.db.patch(id, updates);
  return id;
} });

export const duplicate = mutation({ args: { id: v.id("fashionTests") }, handler: async (ctx, { id }) => {
  const user = await requireUserId(ctx);
  const source = await assertOwnedTest(ctx, id, user);
  const title = `${source.title} (copie)`.slice(0, 120);
  const base = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test";
  const now = Date.now();
  const newTestId = await ctx.db.insert("fashionTests", { collectionId: source.collectionId, title, description: source.description, creatorId: user, slug: `${base}-${now.toString(36)}`, status: "draft", settings: { ...source.settings }, createdAt: now, updatedAt: now });
  const questions = await ctx.db.query("questions").withIndex("by_test", (q) => q.eq("testId", id)).collect();
  for (const q of questions.sort((a, b) => a.sortOrder - b.sortOrder)) {
    await ctx.db.insert("questions", { testId: newTestId, text: q.text, type: q.type, required: q.required, options: [...q.options], min: q.min, max: q.max, helpText: q.helpText, modelId: q.modelId, sortOrder: q.sortOrder });
  }
  return newTestId;
} });

export const generateQuestions = mutation({ args: { testId: v.id("fashionTests") }, handler: async (ctx, { testId }) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, testId, user);
  if (test.status !== "draft") throw new Error("Seul un brouillon peut générer des questions.");
  const existing = await ctx.db.query("questions").withIndex("by_test", (q) => q.eq("testId", testId)).collect();
  if (existing.length) throw new Error("Des questions existent déjà. Supprime-les d'abord.");
  const models = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", test.collectionId)).collect();
  if (!models.length) throw new Error("Ajoutez un modèle d'abord.");
  const base: Array<{ text: string; type: string; required: boolean; options: string[]; min?: number; max?: number; helpText?: string; modelId?: Id<"models"> }> = [
    { text: `Parmi ces ${models.length} modèles, lequel attire le plus ton regard ?`, type: "single_choice", required: true, options: models.map((m) => m.name), helpText: "Une seule réponse." },
    { text: "Comment notes-tu l'attrait global de cette collection ?", type: "rating", required: true, options: [], min: 1, max: 5, helpText: "1 = peu, 5 = beaucoup" },
    { text: "À quel prix cette pièce te semble juste ?", type: "price", required: false, options: [], min: 5000, max: 150000, helpText: "En FCFA", modelId: models[0]._id },
  ];
  for (let i = 0; i < base.length; i++) {
    const q = base[i];
    const validated = validateQuestionDefinition(q as Parameters<typeof validateQuestionDefinition>[0]);
    await ctx.db.insert("questions", { testId, text: validated.text, type: q.type, required: q.required, options: validated.options, min: validated.min, max: validated.max, helpText: q.helpText, modelId: q.modelId, sortOrder: i });
  }
  return testId;
} });

export const updateSettings = mutation({ args: {
  id: v.id("fashionTests"),
  maxResponses: v.optional(v.union(v.number(), v.null())),
  closesAt: v.optional(v.union(v.number(), v.null())),
  anonymousResponses: v.optional(v.boolean()),
  collectRespondentProfile: v.optional(v.union(v.boolean(), v.array(v.string()))),
  randomizeQuestions: v.optional(v.boolean()),
  requireAllQuestions: v.optional(v.boolean()),
  completionMessage: v.optional(v.string()),
}, handler: async (ctx, { id, ...patch }) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, id, user);
  if (test.status !== "draft") throw new Error("Les réglages d'un test publié ne sont plus modifiables.");
  if (patch.maxResponses !== undefined && patch.maxResponses !== null && (!Number.isInteger(patch.maxResponses) || patch.maxResponses < 1)) throw new Error("La limite de réponses est invalide.");
  if (patch.closesAt !== undefined && patch.closesAt !== null && patch.closesAt <= Date.now()) throw new Error("La date de fermeture doit être dans le futur.");
  if (patch.completionMessage !== undefined && patch.completionMessage.trim().length > 240) throw new Error("Le message de fin est trop long.");
  const settings = { ...test.settings };
  if (patch.maxResponses !== undefined) {
    if (patch.maxResponses === null) delete settings.maxResponses;
    else settings.maxResponses = patch.maxResponses;
  }
  if (patch.closesAt !== undefined) {
    if (patch.closesAt === null) delete settings.closesAt;
    else settings.closesAt = patch.closesAt;
  }
  if (patch.anonymousResponses !== undefined) settings.anonymousResponses = patch.anonymousResponses;
  if (patch.collectRespondentProfile !== undefined) settings.collectRespondentProfile = patch.collectRespondentProfile;
  if (patch.randomizeQuestions !== undefined) settings.randomizeQuestions = patch.randomizeQuestions;
  if (patch.requireAllQuestions !== undefined) settings.requireAllQuestions = patch.requireAllQuestions;
  if (patch.completionMessage !== undefined) settings.completionMessage = patch.completionMessage.trim() || undefined;
  await ctx.db.patch(id, { settings, updatedAt: Date.now() });
  return id;
} });

const questionArgs = {
  text: v.string(),
  type: v.string(),
  required: v.boolean(),
  options: v.array(v.string()),
  modelId: v.optional(v.id("models")),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  helpText: v.optional(v.string()),
};

async function assertQuestionModel(ctx: QueryCtx, test: Doc<"fashionTests">, modelId: Id<"models"> | undefined, user: string) {
  if (!modelId) return;
  const model = await ctx.db.get(modelId);
  if (!model || model.creatorId !== user || model.collectionId !== test.collectionId) throw new Error("Le modèle sélectionné est invalide.");
}

export const addQuestion = mutation({ args: { testId: v.id("fashionTests"), ...questionArgs }, handler: async (ctx, args) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, args.testId, user);
  if (test.status !== "draft") throw new Error("Un test publié ne peut plus être modifié.");
  const question = validateQuestionDefinition(args);
  await assertQuestionModel(ctx, test, args.modelId, user);
  const rows = await ctx.db.query("questions").withIndex("by_test", q => q.eq("testId", args.testId)).collect();
  return ctx.db.insert("questions", { ...args, ...question, sortOrder: rows.length });
} });

export const updateQuestion = mutation({ args: { testId: v.id("fashionTests"), questionId: v.id("questions"), ...questionArgs }, handler: async (ctx, args) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, args.testId, user);
  const questionRow = await ctx.db.get(args.questionId);
  if (test.status !== "draft" || !questionRow || questionRow.testId !== args.testId) throw new Error("Question non modifiable.");
  const question = validateQuestionDefinition(args);
  await assertQuestionModel(ctx, test, args.modelId, user);
  await ctx.db.patch(args.questionId, {
    text: question.text,
    type: args.type,
    required: args.required,
    options: question.options,
    modelId: args.modelId,
    min: question.min,
    max: question.max,
    helpText: args.helpText?.trim() || undefined,
  });
  return args.questionId;
} });

export const reorderQuestions = mutation({ args: { testId: v.id("fashionTests"), questionIds: v.array(v.id("questions")) }, handler: async (ctx, args) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, args.testId, user);
  if (test.status !== "draft") throw new Error("Un test publié ne peut plus être modifié.");
  const rows = await ctx.db.query("questions").withIndex("by_test", q => q.eq("testId", args.testId)).collect();
  if (args.questionIds.length !== rows.length || new Set(args.questionIds).size !== rows.length || rows.some(row => !args.questionIds.includes(row._id))) throw new Error("L'ordre des questions est invalide.");
  await Promise.all(args.questionIds.map((questionId, index) => ctx.db.patch(questionId, { sortOrder: index })));
  return args.questionIds;
} });

export const removeQuestion = mutation({ args: { testId: v.id("fashionTests"), questionId: v.id("questions") }, handler: async (ctx, args) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, args.testId, user);
  const question = await ctx.db.get(args.questionId);
  if (test.status !== "draft" || !question || question.testId !== args.testId) throw new Error("Question non modifiable.");
  await ctx.db.delete(args.questionId);
} });

export const publish = mutation({ args: { id: v.id("fashionTests") }, handler: async (ctx, { id }) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, id, user);
  if (test.status !== "draft") throw new Error("Ce test n'est plus publiable.");
  const questions = await ctx.db.query("questions").withIndex("by_test", q => q.eq("testId", id)).collect();
  const models = await ctx.db.query("models").withIndex("by_collection", q => q.eq("collectionId", test.collectionId)).collect();
  if (!questions.length || !models.length) throw new Error("Ajoutez au moins un modèle et une question.");
  for (const question of questions) {
    validateQuestionDefinition(question);
    if (question.modelId && !models.some(model => model._id === question.modelId)) throw new Error("Une question référence un modèle invalide.");
  }
  if (test.settings.closesAt !== undefined && test.settings.closesAt <= Date.now()) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { closesAt, ...rest } = test.settings;
    await ctx.db.patch(id, { settings: rest as typeof test.settings, updatedAt: Date.now() });
    test.settings = rest as typeof test.settings;
  }
  if (test.settings.maxResponses !== undefined && (!Number.isInteger(test.settings.maxResponses) || test.settings.maxResponses < 1)) throw new Error("La limite de réponses est invalide.");
  await ctx.db.patch(id, { status: "published", updatedAt: Date.now() });
  return id;
} });

export const close = mutation({ args: { id: v.id("fashionTests") }, handler: async (ctx, { id }) => {
  const user = await requireUserId(ctx);
  const test = await assertOwnedTest(ctx, id, user);
  if (test.status !== "published") throw new Error("Seul un test publié peut être fermé. Transition attendue : draft -> published -> closed.");
  await ctx.db.patch(id, { status: "closed", updatedAt: Date.now() });
  return id;
} });

export const recordShare = mutation({ args: { id: v.id("fashionTests"), channel: v.string() }, handler: async (ctx, args) => {
  const user = await requireUserId(ctx);
  await assertOwnedTest(ctx, args.id, user);
  const channel = args.channel.trim().toLowerCase();
  if (!channel || channel.length > 40) throw new Error("Canal de partage invalide.");
  return ctx.db.insert("shareEvents", { testId: args.id, channel, createdAt: Date.now() });
} });

export const getTestInternal = internalQuery({ args: { testId: v.id("fashionTests") }, handler: async (ctx, { testId }) => ctx.db.get(testId) });

export const listModelsInternal = internalQuery({ args: { collectionId: v.id("collections") }, handler: async (ctx, { collectionId }) => ctx.db.query("models").withIndex("by_collection", q => q.eq("collectionId", collectionId)).collect() });
