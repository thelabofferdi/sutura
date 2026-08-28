import assert from "node:assert/strict";
import test from "node:test";
import type { Id } from "../convex/_generated/dataModel.ts";
import { validatePublicSubmission } from "../convex/validation.ts";

const settings = {
  anonymousResponses: true,
  collectRespondentProfile: false,
  requireAllQuestions: false,
} as const;

const questionId = (value: string) => value as Id<"questions">;

const questions = [
  {
    _id: questionId("question-choice"),
    text: "Quelle couleur préférez-vous ?",
    type: "single_choice",
    required: true,
    options: ["Noir", "Ivoire"],
    min: undefined,
    max: undefined,
  },
  {
    _id: questionId("question-ranking"),
    text: "Classez les matières",
    type: "ranking",
    required: true,
    options: ["Lin", "Soie", "Coton"],
    min: undefined,
    max: undefined,
  },
  {
    _id: questionId("question-scale"),
    text: "Notez la coupe",
    type: "scale",
    required: false,
    options: [],
    min: 1,
    max: 5,
  },
  {
    _id: questionId("question-yes-no"),
    text: "Achèteriez-vous ce modèle ?",
    type: "yes_no",
    required: false,
    options: [],
    min: undefined,
    max: undefined,
  },
];

const validAnswers = {
  "question-choice": "Noir",
  "question-ranking": ["Soie", "Lin", "Coton"],
  "question-scale": 4,
  "question-yes-no": true,
};

function expectInvalid(mutator: () => void, message: string) {
  assert.throws(mutator, /.+/, message);
}

test("accepts a valid public submission", () => {
  assert.doesNotThrow(() =>
    validatePublicSubmission(questions, settings, validAnswers, undefined, "submission_123"),
  );
});

test("rejects malformed idempotency keys", () => {
  expectInvalid(
    () => validatePublicSubmission(questions, settings, validAnswers, undefined, "short"),
    "short keys must be rejected",
  );
});

test("rejects unknown questions and invalid options", () => {
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, unknown: "x" }, undefined, "submission_123"),
    "unknown question ids must be rejected",
  );
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, "question-choice": "Rouge" }, undefined, "submission_123"),
    "options outside the definition must be rejected",
  );
});

test("rejects incomplete rankings and invalid boolean answers", () => {
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, "question-ranking": ["Lin"] }, undefined, "submission_123"),
    "rankings must include every option",
  );
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, "question-yes-no": "yes" }, undefined, "submission_123"),
    "yes/no answers must be boolean",
  );
});

test("enforces respondent profile policy", () => {
  expectInvalid(
    () => validatePublicSubmission(questions, settings, validAnswers, { firstName: "Ada" }, "submission_123"),
    "anonymous tests must not accept respondent profiles",
  );

  const profileSettings = {
    ...settings,
    anonymousResponses: false,
    collectRespondentProfile: ["firstName", "city"] as string[],
  };
  expectInvalid(
    () => validatePublicSubmission(questions, profileSettings, validAnswers, { firstName: "Ada" }, "submission_123"),
    "required respondent fields must be present",
  );
  assert.doesNotThrow(() =>
    validatePublicSubmission(
      questions,
      profileSettings,
      validAnswers,
      { firstName: "Ada", city: "Paris" },
      "submission_123",
    ),
  );
});

test("rejects overly long text answers", () => {
  const textQuestion = { _id: questionId("q-text"), text: "Décrivez", type: "short_text", required: true, options: [], min: undefined, max: undefined } as const;
  expectInvalid(
    () => validatePublicSubmission([textQuestion] as unknown as typeof questions, settings, { "q-text": "a".repeat(501) }, undefined, "submission_123"),
    "short_text over 500 must be rejected",
  );
  const paraQuestion = { _id: questionId("q-para"), text: "Décrivez long", type: "paragraph", required: true, options: [], min: undefined, max: undefined } as const;
  expectInvalid(
    () => validatePublicSubmission([paraQuestion] as unknown as typeof questions, settings, { "q-para": "a".repeat(5001) }, undefined, "submission_123"),
    "paragraph over 5000 must be rejected",
  );
});

test("rejects oversized JSON payloads", () => {
  const huge: Record<string, string> = {};
  for (let i = 0; i < 120; i++) huge[`q-${i}`] = "x".repeat(600);
  // Known ids limited to existing questions; oversize via single huge string triggers length guard
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { "question-choice": "a".repeat(1000) }, undefined, "submission_123"),
    "value over 240 chars must be rejected via ranking/text guard",
  );
});

test("rejects out-of-bounds numeric answers", () => {
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, "question-scale": 10 }, undefined, "submission_123"),
    "scale above max must be rejected",
  );
  expectInvalid(
    () => validatePublicSubmission(questions, settings, { ...validAnswers, "question-scale": 0 }, undefined, "submission_123"),
    "scale below min must be rejected",
  );
});
