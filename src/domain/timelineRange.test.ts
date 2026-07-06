import { describe, expect, it } from 'vitest';

import { dateToPercent, getTimelineRange } from './timelineRange';

describe('timeline range helpers', () => {
  it('builds a day range from 00:00 to the next day', () => {
    const range = getTimelineRange(new Date('2026-05-27T16:30:00'), 'Day');

    expect(range.columns).toHaveLength(24);
    expect(range.headers[0]?.label).toBe('0:00');
    expect(range.headers[16]?.label).toBe('16:00');
    expect(range.totalMinutes).toBe(24 * 60);
    expect(range.startDate.getHours()).toBe(0);
    expect(range.endDate.getDate()).toBe(28);
  });

  it('maps dates to proportional positions inside the range', () => {
    const range = getTimelineRange(new Date('2026-05-27T10:00:00'), 'Day');
    const noon = new Date(range.startDate);
    noon.setHours(12, 0, 0, 0);

    expect(dateToPercent(noon, range)).toBe(50);
  });

  it('uses Monday as the first day of week ranges', () => {
    const range = getTimelineRange(new Date('2026-05-27T10:00:00'), 'Week');

    expect(range.columns).toHaveLength(7);
    expect(range.startDate.getDay()).toBe(1);
    expect(range.headers[0]?.label).toContain('5月25日');
  });
});
