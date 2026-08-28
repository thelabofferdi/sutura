import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwnedTest, requireUserId } from "./lib";

export const get = query({
  args: { testId: v.id("fashionTests") },
  handler: async (ctx, { testId }) => {
    const user = await requireUserId(ctx);
    const test = await assertOwnedTest(ctx, testId, user);
    const questions = (await ctx.db.query("questions").withIndex("by_test", (q) => q.eq("testId", testId)).collect()).sort((a, b) => a.sortOrder - b.sortOrder);
    const responses = await ctx.db.query("publicResponses").withIndex("by_test", (q) => q.eq("testId", testId)).collect();
    const shares = await ctx.db.query("shareEvents").withIndex("by_test", (q) => q.eq("testId", testId)).collect();
    const models = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", test.collectionId)).collect();

    const breakdown = questions.map((question) => {
      const values = responses
        .map((row) => (row.answers as Record<string, unknown>)[String(question._id)])
        .filter((value) => value !== undefined && value !== null && String(value) !== "");
      const flat = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
      const distribution: Record<string, number> = {};
      for (const value of flat) {
        const key = typeof value === "boolean" ? (value ? "Oui" : "Non") : String(value);
        distribution[key] = (distribution[key] ?? 0) + 1;
      }
      const numeric = values.map(Number).filter(Number.isFinite);
      return {
        questionId: String(question._id),
        text: question.text,
        type: question.type,
        required: question.required,
        answersCount: values.length,
        distribution,
        average: numeric.length ? Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length * 10) / 10 : null,
      };
    });

    const ratings = breakdown.filter((x) => ["rating", "scale"].includes(x.type) && x.average !== null);
    const desirability = ratings.length ? Math.round(ratings.reduce((sum, x) => sum + (x.average ?? 0), 0) / ratings.length / 5 * 100) : 0;
    const averageSeconds = responses.length ? Math.round(responses.reduce((sum, row) => sum + Math.max(0, row.completedAt - row.startedAt), 0) / responses.length / 1000) : 0;

    const price: Record<string, number> = {};
    for (const item of breakdown.filter((x) => x.type === "price")) {
      for (const [label, count] of Object.entries(item.distribution)) price[label] = (price[label] ?? 0) + count;
    }

    const sharesByChannel: Record<string, number> = {};
    for (const share of shares) sharesByChannel[share.channel] = (sharesByChannel[share.channel] ?? 0) + 1;

    const modelBreakdown = models.map((model) => {
      const linked = questions.filter((q) => String(q.modelId) === String(model._id));
      const withAnswer = responses.filter((r) => linked.some((q) => (r.answers as Record<string, unknown>)[String(q._id)] !== undefined)).length;
      return { modelId: String(model._id), name: model.name, questionsCount: linked.length, responsesWithAnswer: withAnswer, answerRate: responses.length ? Math.round(withAnswer / responses.length * 100) : 0 };
    });
    const funnel = questions.map((q, i) => ({ questionId: String(q._id), text: q.text, answerCount: breakdown[i].answersCount, answerRate: responses.length ? Math.round(breakdown[i].answersCount / responses.length * 100) : 0 }));
    const abandonmentRate = funnel.length && responses.length ? Math.round((1 - funnel[funnel.length - 1].answerRate / 100) * 100) : null;

    return {
      testId: String(testId),
      executiveSummary: responses.length ? `${responses.length} réponse${responses.length > 1 ? "s" : ""} analysée${responses.length > 1 ? "s" : ""}. Les scores reflètent uniquement les données réellement collectées.` : "Aucune réponse reçue pour le moment.",
      desirabilityScore: desirability,
      unsoldRiskScore: 100 - desirability,
      unsoldRiskLabel: desirability >= 70 ? "faible" : desirability >= 45 ? "modéré" : "élevé",
      visitors: null,
      responses: responses.length,
      conversionRate: null,
      averageResponseSeconds: averageSeconds,
      shares: shares.length,
      sharesByChannel,
      abandonmentRate,
      trafficMeasurementStatus: "Les visites anonymes ne sont pas mesurées. Partage et réponses sont comptés ; les visiteurs ne sont pas dédupliqués.",
      demographics: { cities: {}, countries: {}, sex: {}, averageAge: 0 },
      modelBreakdown,
      funnel,
      priceDistribution: Object.entries(price).map(([label, count]) => ({ label, count })),
      questionBreakdown: breakdown,
    };
  },
});
