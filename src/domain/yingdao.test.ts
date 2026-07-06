import { describe, expect, it } from 'vitest';

import {
  getCronExpression,
  getScheduleReadSummary,
  getTaskDurationMs,
  parseDateValue,
} from './yingdao';
import type { ScheduleItem, TaskListRecord } from '@/src/types/dashboard';

describe('yingdao domain helpers', () => {
  it('parses Yingdao space-separated date values', () => {
    const date = parseDateValue('2026-05-27 16:00:00');

    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getHours()).toBe(16);
  });

  it('converts schedule cron interfaces into cron expressions', () => {
    expect(getCronExpression({ type: 'day', time: '16:30' })).toBe('30 16 * * *');
    expect(getCronExpression({ type: 'week', time: '09:15', dayOfWeeks: [1, 7] })).toBe('15 9 * * 0,6');
    expect(getCronExpression({ type: 'month', time: '08:00', month: 5 })).toBe('0 8 5 * *');
  });

  it('summarizes disabled, schedulable, and unschedulable schedules', () => {
    const schedules: ScheduleItem[] = [
      { scheduleUuid: 'enabled', scheduleName: 'daily', scheduleType: 'timer', enabled: true, cronInterface: { type: 'day', time: '10:00' } },
      { scheduleUuid: 'manual', scheduleName: 'manual', scheduleType: 'manual', enabled: true },
      { scheduleUuid: 'disabled', scheduleName: 'disabled', scheduleType: 'timer', enabled: false, cronInterface: { type: 'day', time: '10:00' } },
    ];

    expect(getScheduleReadSummary(schedules)).toEqual({
      total: 3,
      disabled: 1,
      unschedulable: 1,
      schedulable: 1,
    });
  });

  it('filters unreasonable historical durations', () => {
    const record: TaskListRecord = {
      status: 'finish',
      startTime: '2026-05-27 10:00:00',
      updateTime: '2026-05-27 10:05:00',
    };
    const veryLongRecord: TaskListRecord = {
      status: 'finish',
      startTime: '2026-05-27 10:00:00',
      updateTime: '2026-05-29 10:00:00',
    };

    expect(getTaskDurationMs(record, 24 * 60 * 60 * 1000)).toBe(5 * 60 * 1000);
    expect(getTaskDurationMs(veryLongRecord, 24 * 60 * 60 * 1000)).toBeNull();
  });
});
