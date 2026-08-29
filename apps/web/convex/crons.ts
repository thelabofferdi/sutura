import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("cleanup public submission limits", { minutes: 60 }, internal.publicTests.cleanupExpiredLimits);

export default crons;
