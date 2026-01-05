import { Injectable } from '@nestjs/common';

export interface TimeWindowResult {
  startTime: Date;
  endTime: Date;
  canStartNow: boolean;
  isExpired: boolean;
  isBeforeStart: boolean;
  timeUntilStart: number;
  timeUntilEnd: number;
}

@Injectable()
export class TimeWindowService {
  /**
   * Calculate interview time window with re-interview extension logic
   * Re-interviews get 2 hours extension from the end time
   */
  calculateTimeWindow(
    candidateStartTime: Date | null,
    candidateEndTime: Date | null,
    jobStartTime: Date,
    jobEndTime: Date,
    isReInterviewed: boolean,
  ): TimeWindowResult {
    const now = new Date();
    const startTime = new Date(candidateStartTime || jobStartTime);
    let endTime = new Date(candidateEndTime || jobEndTime);

    // Rule: if requested for re-interview, extend by 2 hours
    if (isReInterviewed) {
      endTime = new Date(endTime.getTime() + 2 * 60 * 60 * 1000);
    }

    // Calculate time differences in milliseconds
    const timeUntilStart = startTime.getTime() - now.getTime();
    const timeUntilEnd = endTime.getTime() - now.getTime();

    // Determine if interview can start now
    const canStartNow = now >= startTime && now < endTime;
    const isExpired = now >= endTime;
    const isBeforeStart = now < startTime;

    return {
      startTime,
      endTime,
      canStartNow,
      isExpired,
      isBeforeStart,
      timeUntilStart: Math.max(0, timeUntilStart),
      timeUntilEnd: Math.max(0, timeUntilEnd),
    };
  }
}
