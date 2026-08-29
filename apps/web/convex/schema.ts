import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
};

const collectionStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

const testStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("closed"),
);

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.string(),
    name: v.string(),
    brandName: v.string(),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    ...timestamps,
  }).index("by_user", ["userId"]),
  collections: defineTable({
    creatorId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    season: v.optional(v.string()),
    category: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    launchDate: v.optional(v.string()),
    status: collectionStatus,
    ...timestamps,
  })
    .index("by_creator", ["creatorId"])
    .index("by_creator_status", ["creatorId", "status"]),
  models: defineTable({
    creatorId: v.string(),
    collectionId: v.id("collections"),
    name: v.string(),
    description: v.optional(v.string()),
    photoIds: v.array(v.id("_storage")),
    sketchId: v.optional(v.id("_storage")),
    videoId: v.optional(v.id("_storage")),
    colors: v.array(v.string()),
    desiredPrice: v.optional(v.number()),
    sortOrder: v.number(),
    ...timestamps,
  })
    .index("by_collection", ["collectionId"])
    .index("by_creator", ["creatorId"]),
  fashionTests: defineTable({
    creatorId: v.string(),
    collectionId: v.id("collections"),
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: testStatus,
    settings: v.object({
      maxResponses: v.optional(v.number()),
      closesAt: v.optional(v.number()),
      anonymousResponses: v.boolean(),
      collectRespondentProfile: v.union(v.boolean(), v.array(v.string())),
      randomizeQuestions: v.optional(v.boolean()),
      requireAllQuestions: v.optional(v.boolean()),
      completionMessage: v.optional(v.string()),
    }),
    ...timestamps,
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["creatorId"])
    .index("by_collection", ["collectionId"]),
  questions: defineTable({
    testId: v.id("fashionTests"),
    modelId: v.optional(v.id("models")),
    text: v.string(),
    type: v.string(),
    required: v.boolean(),
    options: v.array(v.string()),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
    helpText: v.optional(v.string()),
    sortOrder: v.number(),
  }).index("by_test", ["testId"]),
  publicResponses: defineTable({
    testId: v.id("fashionTests"),
    respondent: v.optional(v.any()),
    answers: v.any(),
    startedAt: v.number(),
    completedAt: v.number(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_test", ["testId"])
    .index("by_test_idempotency", ["testId", "idempotencyKey"]),
  publicSubmissionLimits: defineTable({
    testId: v.id("fashionTests"),
    clientKey: v.string(),
    windowStartedAt: v.number(),
    submissionCount: v.number(),
    updatedAt: v.number(),
  }).index("by_test_client", ["testId", "clientKey"]),
  shareEvents: defineTable({
    testId: v.id("fashionTests"),
    channel: v.string(),
    createdAt: v.number(),
  }).index("by_test", ["testId"]),
  recommendationCache: defineTable({
    testId: v.id("fashionTests"),
    creatorId: v.string(),
    responseCount: v.number(),
    provider: v.union(v.literal("local"), v.literal("imole")),
    dataPolicy: v.string(),
    recommendations: v.array(v.object({
      priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      category: v.union(v.literal("production"), v.literal("pricing"), v.literal("audience"), v.literal("content"), v.literal("risk")),
      message: v.string(),
      rationale: v.optional(v.string()),
    })),
    generatedAt: v.number(),
    inputHash: v.optional(v.string()),
    configHash: v.optional(v.string()),
    aggregationVersion: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    model: v.optional(v.string()),
  })
    .index("by_test", ["testId"])
    .index("by_creator", ["creatorId"]),
  aiRateLimits: defineTable({
    key: v.string(),
    windowStartedAt: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  aiGenerationLocks: defineTable({
    testId: v.id("fashionTests"),
    creatorId: v.string(),
    step: v.string(),
    startedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_test_step", ["testId", "step"]).index("by_expires", ["expiresAt"]),
  aiApiKeys: defineTable({
    name: v.string(),
    maskedKey: v.string(),
    encryptedKey: v.string(),
    provider: v.union(v.literal("imole"), v.literal("openai"), v.literal("generic")),
    isActive: v.boolean(),
    createdBy: v.string(),
    ...timestamps,
  }).index("by_provider", ["provider"]),
  aiPipelineConfigs: defineTable({
    step: v.union(v.literal("generateQuestions"), v.literal("recommendations"), v.literal("copilot"), v.literal("detectInconsistencies"), v.literal("summarizeResponses"), v.literal("assistantLaunch")),
    enabled: v.boolean(),
    provider: v.union(v.literal("local"), v.literal("imole"), v.literal("auto")),
    model: v.string(),
    baseUrl: v.optional(v.string()),
    apiKeyId: v.optional(v.id("aiApiKeys")),
    promptVersion: v.string(),
    fallbackToLocal: v.boolean(),
    updatedBy: v.string(),
    ...timestamps,
  }).index("by_step", ["step"]),
  adminAuditLogs: defineTable({
    actorId: v.string(),
    actorEmail: v.optional(v.string()),
    action: v.string(),
    targetId: v.optional(v.string()),
    step: v.optional(v.string()),
    provider: v.optional(v.string()),
    status: v.union(v.literal("success"), v.literal("error")),
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_actor", ["actorId"]).index("by_created", ["createdAt"]),
});
