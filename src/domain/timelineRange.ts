import {
  addDays,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

import type { ViewMode } from '@/src/types/dashboard';

export interface TimelineHeader {
  label: string;
  colSpan: number;
}

export interface TimelineRange {
  startDate: Date;
  endDate: Date;
  headers: TimelineHeader[];
  columns: Date[];
  totalMinutes: number;
}

export function getTimelineRange(currentDate: Date, viewMode: ViewMode): TimelineRange {
  let start: Date;
  let end: Date;
  let columns: Date[] = [];

  if (viewMode === 'Day') {
    start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    end = addDays(start, 1);
    for (let hour = 0; hour < 24; hour += 1) {
      const point = new Date(start);
      point.setHours(hour);
      columns.push(point);
    }
  } else if (viewMode === 'Week') {
    start = startOfWeek(currentDate, { weekStartsOn: 1 });
    end = addDays(start, 7);
    columns = eachDayOfInterval({ start, end: addDays(end, -1) });
  } else if (viewMode === 'Month') {
    start = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    end = addDays(monthEnd, 1);
    columns = eachDayOfInterval({ start, end: monthEnd });
  } else {
    start = startOfYear(currentDate);
    end = addYears(start, 1);
    for (let month = 0; month < 12; month += 1) {
      const point = new Date(start);
      point.setMonth(month);
      columns.push(point);
    }
  }

  const headers = columns.map((date) => {
    if (viewMode === 'Day') return { label: format(date, 'H:00'), colSpan: 1 };
    if (viewMode === 'Week') return { label: format(date, 'M月d日 EEEE', { locale: zhCN }), colSpan: 1 };
    if (viewMode === 'Month') return { label: format(date, 'd日'), colSpan: 1 };
    return { label: format(date, 'M月'), colSpan: 1 };
  });

  return {
    startDate: start,
    endDate: end,
    headers,
    columns,
    totalMinutes: Math.max(1, (end.getTime() - start.getTime()) / 60000),
  };
}

export function dateToPercent(date: Date, range: Pick<TimelineRange, 'startDate' | 'totalMinutes'>): number {
  return ((date.getTime() - range.startDate.getTime()) / (range.totalMinutes * 60 * 1000)) * 100;
}
