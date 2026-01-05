/**
 * Subscription Plan Configuration
 * Centralized configuration for plan limits and features
 */

import { Plan } from '@prisma/client';

export interface PlanLimits {
  // Job Limits
  maxJobs: number;
  maxCandidatesPerJob: number;

  // Proctoring Features
  fullScreenMode: boolean;
  eyeTracking: boolean;
  noFaceDetection: boolean;
  multiFaceDetection: boolean;
  browserSafety: boolean;
  screenRecording: boolean;

  // Proctoring Thresholds (in seconds)
  noFaceThreshold: number;
  multiFaceThreshold: number;

  // Warning Limits
  maxWarnings: number;

  // AI Features
  priorityAIScoring: boolean;
}

export const PLAN_CONFIG: Record<Plan, PlanLimits> = {
  [Plan.FREE]: {
    // Job Limits
    maxJobs: 5,
    maxCandidatesPerJob: 30,

    // Proctoring Features
    fullScreenMode: true,
    eyeTracking: false,
    noFaceDetection: false,
    multiFaceDetection: false,
    browserSafety: false,
    screenRecording: false,

    // Proctoring Thresholds
    noFaceThreshold: 0, // Not applicable
    multiFaceThreshold: 0, // Not applicable

    // Warning Limits
    maxWarnings: 5,

    // AI Features
    priorityAIScoring: false,
  },

  [Plan.PRO]: {
    // Job Limits
    maxJobs: 15,
    maxCandidatesPerJob: -1, // Unlimited

    // Proctoring Features
    fullScreenMode: true,
    eyeTracking: true,
    noFaceDetection: true,
    multiFaceDetection: false,
    browserSafety: true,
    screenRecording: true,

    // Proctoring Thresholds
    noFaceThreshold: 3, // 3 seconds
    multiFaceThreshold: 0, // Not applicable

    // Warning Limits
    maxWarnings: 5,

    // AI Features
    priorityAIScoring: false,
  },

  [Plan.ULTRA]: {
    // Job Limits
    maxJobs: -1, // Unlimited
    maxCandidatesPerJob: -1, // Unlimited

    // Proctoring Features
    fullScreenMode: true,
    eyeTracking: true,
    noFaceDetection: true,
    multiFaceDetection: true,
    browserSafety: true,
    screenRecording: true,

    // Proctoring Thresholds
    noFaceThreshold: 3, // 3 seconds
    multiFaceThreshold: 2, // 2 seconds

    // Warning Limits
    maxWarnings: 5,

    // AI Features
    priorityAIScoring: true,
  },
};

/**
 * Get plan configuration
 */
export function getPlanConfig(plan: Plan): PlanLimits {
  return PLAN_CONFIG[plan];
}

/**
 * Check if a feature is available for a plan
 */
export function isFeatureAvailable(
  plan: Plan,
  feature: keyof PlanLimits,
): boolean {
  const config = getPlanConfig(plan);
  return !!config[feature];
}

/**
 * Get max warnings for a plan
 */
export function getMaxWarnings(plan: Plan): number {
  return getPlanConfig(plan).maxWarnings;
}

/**
 * Check if plan can create more jobs
 */
export function canCreateJob(plan: Plan, currentJobCount: number): boolean {
  const config = getPlanConfig(plan);
  return config.maxJobs === -1 || currentJobCount < config.maxJobs;
}

/**
 * Check if plan can add more candidates
 */
export function canAddCandidates(
  plan: Plan,
  currentCandidateCount: number,
  newCandidates: number,
): boolean {
  const config = getPlanConfig(plan);
  if (config.maxCandidatesPerJob === -1) return true;
  return currentCandidateCount + newCandidates <= config.maxCandidatesPerJob;
}
