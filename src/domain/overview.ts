import type { ExtendedScheduleTask } from '@/src/types/dashboard';
import { uniqueStrings } from './common';

export function getTaskActualAccountNames(task: ExtendedScheduleTask): string[] {
  const actualNames = uniqueStrings(task.actualClientNames || []);
  if (actualNames.length > 0) return actualNames;

  return uniqueStrings([...(task.clientNames || []), task.clientName]);
}

export function getTaskOverviewScopes(task: ExtendedScheduleTask): Array<{ name: string; isGroup: boolean }> {
  const groupNames = uniqueStrings(task.groupNames || []);
  if (groupNames.length > 0) {
    return groupNames.map((name) => ({ name, isGroup: true }));
  }

  const accountNames = getTaskActualAccountNames(task);
  if (accountNames.length > 0) {
    return accountNames.map((name) => ({ name, isGroup: false }));
  }

  return [{ name: '未指定账号', isGroup: false }];
}

export function taskOverlapsRange(task: ExtendedScheduleTask, start: Date, end: Date): boolean {
  return task.startDate < end && task.endDate > start;
}
