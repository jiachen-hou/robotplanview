import { describe, expect, it } from 'vitest';

import { generateScheduleTasks } from './timelineTasks';
import type { ScheduleDetail } from '@/src/types/dashboard';

describe('timeline task generation', () => {
  const now = new Date('2026-05-27T10:00:00');

  it('generates future tasks from recurring schedule rules', () => {
    const schedule: ScheduleDetail = {
      scheduleUuid: 'schedule-daily',
      scheduleName: '每日导入',
      scheduleType: 'timer',
      enabled: true,
      cronInterface: { type: 'day', time: '16:00' },
      averageDurationMins: 5,
      robotClientList: [{ robotClientName: 'lvming@qingmu' }],
    };

    const result = generateScheduleTasks([schedule], { now, futureDays: 1 });

    expect(result.skipped).toEqual([]);
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    expect(result.tasks[0]?.startDate.getHours()).toBe(16);
    expect(result.tasks[0]?.endDate.getMinutes()).toBe(5);
    expect(result.tasks[0]?.identityKey).toContain('future|schedule-daily');
  });

  it('reports schedules that cannot produce timeline entries', () => {
    const manualSchedule: ScheduleDetail = {
      scheduleUuid: 'manual',
      scheduleName: '手动任务',
      scheduleType: 'manual',
      enabled: true,
    };

    const result = generateScheduleTasks([manualSchedule], { now, futureDays: 1 });

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        scheduleUuid: 'manual',
        reason: 'no_schedule_rule',
      }),
    ]);
  });

  it('keeps invalid cron schedules visible in diagnostics instead of crashing', () => {
    const invalidSchedule: ScheduleDetail = {
      scheduleUuid: 'invalid-cron',
      scheduleName: '坏规则',
      scheduleType: 'timer',
      enabled: true,
      cronInterface: { cronExpress: 'not a cron' },
    };

    const result = generateScheduleTasks([invalidSchedule], { now, futureDays: 1 });

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        scheduleUuid: 'invalid-cron',
        reason: 'cron_parse_failed',
      }),
    ]);
  });

  it('preserves historical runs with stable identities', () => {
    const schedule: ScheduleDetail = {
      scheduleUuid: 'schedule-history',
      scheduleName: '历史任务',
      scheduleType: 'timer',
      enabled: true,
      historicalRuns: [
        {
          id: 'run-1',
          start: new Date('2026-05-27T09:00:00'),
          end: new Date('2026-05-27T09:05:00'),
          status: 'finish',
          robotNames: ['应用A'],
          clientNames: ['admin@qingmu'],
        },
      ],
    };

    const result = generateScheduleTasks([schedule], { now, futureDays: 1 });

    expect(result.tasks[0]?.isHistorical).toBe(true);
    expect(result.tasks[0]?.status).toBe('completed');
    expect(result.tasks[0]?.identityKey).toContain('historical|schedule-history|run-1');
  });
});
