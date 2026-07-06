import type { RealtimeQueueTask, TaskIdentityParts } from '@/src/types/dashboard';
import { normalizeLookupKey } from './common';

function normalizeTimePart(value?: string | Date | null): string {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value).trim();
}

export function buildTaskIdentity(parts: TaskIdentityParts): string {
  return [
    parts.sourceType,
    normalizeLookupKey(parts.scheduleUuid),
    normalizeLookupKey(parts.taskUuid),
    normalizeLookupKey(parts.accountName),
    normalizeLookupKey(parts.taskName),
    normalizeTimePart(parts.startTime),
    normalizeLookupKey(parts.status),
  ].join('|');
}

export function getQueueTaskIdentity(task: RealtimeQueueTask, scopeNames: string[] = []): string {
  return buildTaskIdentity({
    sourceType: 'queue',
    scheduleUuid: task.scheduleUuid,
    taskUuid: task.taskUuid,
    accountName: scopeNames.join('|'),
    taskName: task.taskName || task.scheduleName,
    startTime: task.startedAt || task.updatedAt,
    status: task.status,
  });
}
