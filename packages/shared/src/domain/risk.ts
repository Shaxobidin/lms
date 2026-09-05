/**
 * Maqsad: early-warning — xavf ostidagi talabalarni aniqlash (F-13).
 *
 * Model ataylab sodda va tushuntiriladigan (explainable): har bir omil aniq
 * og'irlikka ega, natijada tyutor "nima uchun bu talaba xavfli" degan savolga
 * javob ololadi. Qora quti ML modeli bu yerda asossiz murakkablik bo'lardi.
 */

import type { RiskAssessment, RiskFactors } from '../schemas/document';
import { clamp, round2 } from './grading';

export interface RiskInput {
  userId: string;
  /** 0..100 — davomat foizi. */
  attendancePercent: number;
  /** Muddati o'tgan va topshirilmagan topshiriqlar soni. */
  missedAssignments: number;
  /** Joriy o'zlashtirish balli (0..100). */
  currentScore: number;
  /** Oxirgi kirish/faollikdan beri o'tgan kunlar. */
  inactiveDays: number;
  /** Kursdagi umumiy topshiriqlar soni — nisbatni hisoblash uchun. */
  totalAssignments: number;
}

export interface RiskThresholds {
  attendanceCritical: number;
  attendanceWarning: number;
  scoreCritical: number;
  scoreWarning: number;
  inactiveCritical: number;
  inactiveWarning: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  attendanceCritical: 60,
  attendanceWarning: 75,
  scoreCritical: 50,
  scoreWarning: 60,
  inactiveCritical: 14,
  inactiveWarning: 7,
};

/** Omillar og'irliklari — yig'indisi 100. */
const WEIGHTS = {
  attendance: 30,
  assignments: 30,
  score: 25,
  inactivity: 15,
} as const;

/**
 * Xavf balli 0..100. Har bir omil o'z shkalasida 0..1 ga keltiriladi,
 * so'ng og'irlikka ko'paytiriladi.
 */
export function assessRisk(
  input: RiskInput,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskAssessment {
  // Davomat: 100% -> 0 xavf, kritik chegara va past -> 1
  const attendanceRatio =
    input.attendancePercent >= 100
      ? 0
      : clamp(
          (100 - input.attendancePercent) / Math.max(1, 100 - thresholds.attendanceCritical),
          0,
          1,
        );

  // Topshiriqlar: topshirilmaganlar ulushi
  const assignmentRatio =
    input.totalAssignments > 0 ? clamp(input.missedAssignments / input.totalAssignments, 0, 1) : 0;

  // Ball: saralash chegarasidan qanchalik uzoq
  const scoreRatio =
    input.currentScore >= thresholds.scoreWarning
      ? 0
      : clamp(
          (thresholds.scoreWarning - input.currentScore) / Math.max(1, thresholds.scoreWarning),
          0,
          1,
        );

  // Faolsizlik
  const inactivityRatio = clamp(
    input.inactiveDays / Math.max(1, thresholds.inactiveCritical),
    0,
    1,
  );

  const riskScore = round2(
    attendanceRatio * WEIGHTS.attendance +
      assignmentRatio * WEIGHTS.assignments +
      scoreRatio * WEIGHTS.score +
      inactivityRatio * WEIGHTS.inactivity,
  );

  const factors: RiskFactors = {
    lowAttendance: input.attendancePercent < thresholds.attendanceWarning,
    missedAssignments: input.missedAssignments,
    lowScore: input.currentScore < thresholds.scoreWarning,
    inactiveDays: input.inactiveDays,
  };

  const recommendationKeys: string[] = [];
  if (input.attendancePercent < thresholds.attendanceCritical) {
    recommendationKeys.push('risk.recommendation.contact_tutor');
  }
  if (input.missedAssignments > 0) {
    recommendationKeys.push('risk.recommendation.assignment_deadline_extension');
  }
  if (input.currentScore < thresholds.scoreCritical) {
    recommendationKeys.push('risk.recommendation.additional_consultation');
  }
  if (input.inactiveDays >= thresholds.inactiveWarning) {
    recommendationKeys.push('risk.recommendation.re_engagement_message');
  }
  if (recommendationKeys.length === 0) {
    recommendationKeys.push('risk.recommendation.keep_monitoring');
  }

  return {
    userId: input.userId,
    riskScore,
    level: riskScore >= 60 ? 'HIGH' : riskScore >= 35 ? 'MEDIUM' : 'LOW',
    factors,
    recommendationKeys,
  };
}
