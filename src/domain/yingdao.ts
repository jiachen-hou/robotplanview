import type {
  CronInterface,
  ExtendedScheduleTask,
  ScheduleDetail,
  ScheduleItem,
  ScheduleReadSummary,
  TaskClient,
  TaskListRecord,
} from '@/src/types/dashboard';
import { uniqueStrings, formatNamesForLabel } from './common';

export function getScheduleGroupNames(detail: Partial<ScheduleDetail>): string[] {
  return uniqueStrings([
    ...(detail.robotClientGroupList?.flatMap((item) => [item.robotClientGroupName, item.name]) || []),
    ...(detail.robotGroupList?.flatMap((item) => [item.robotGroupName, item.name]) || []),
    detail.robotClientGroup?.name,
    detail.clientGroupName,
    detail.robotGroupName,
  ]);
}

export function getScheduleConfiguredAccountNames(detail: Partial<ScheduleDetail>): string[] {
  return uniqueStrings([
    ...(detail.robotClientList?.flatMap((client) => [client.robotClientName, client.windowsUserName]) || []),
  ]);
}

export function describeExecutionScope(
  groupNames: string[],
  configuredAccountNames: string[],
  clientNames: string[] = [],
): { executionScopeType: ExtendedScheduleTask['executionScopeType']; executionScopeLabel: string } {
  const executionScopeType: ExtendedScheduleTask['executionScopeType'] = groupNames.length > 0 && configuredAccountNames.length > 0
    ? 'mixed'
    : groupNames.length > 0
      ? 'group'
      : configuredAccountNames.length > 0
        ? 'account'
        : 'unknown';

  const executionScopeLabel = executionScopeType === 'mixed'
    ? `指定账号 ${formatNamesForLabel(configuredAccountNames, '未返回账号')}；机器人组 ${formatNamesForLabel(groupNames, '未返回分组')}`
    : executionScopeType === 'group'
      ? `从机器人组 ${formatNamesForLabel(groupNames, '未返回分组')} 中调度`
      : executionScopeType === 'account'
        ? `指定账号 ${formatNamesForLabel(configuredAccountNames, '未返回账号')}`
        : clientNames.length > 0
          ? `历史账号 ${formatNamesForLabel(clientNames, '未返回账号')}`
          : '未指定执行范围';

  return { executionScopeType, executionScopeLabel };
}

export function parseDateValue(value?: string | number | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return new Date(value > 9999999999 ? value : value * 1000);
  }
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseApiList<T>(payload: unknown): T[] {
  const source = payload as any;
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.data?.dataList)) return source.data.dataList;
  if (Array.isArray(source?.data?.data)) return source.data.data;
  if (Array.isArray(source?.data?.list)) return source.data.list;
  if (Array.isArray(source?.data?.records)) return source.data.records;
  if (Array.isArray(source?.list)) return source.list;
  if (Array.isArray(source?.records)) return source.records;
  if (Array.isArray(source)) return source;
  return [];
}

export function parseCronInterface(cronInterface?: CronInterface | string | null): CronInterface | null {
  if (!cronInterface) return null;
  if (typeof cronInterface === 'string') {
    try {
      return JSON.parse(cronInterface);
    } catch {
      return null;
    }
  }
  return cronInterface;
}

export function getCronExpression(cronInterface?: CronInterface | null): string | null {
  if (!cronInterface) return null;
  if (cronInterface.cronExpress) return cronInterface.cronExpress;

  const parseTime = (timeStr?: string) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    return {
      hour: Number.parseInt(parts[0], 10),
      minute: Number.parseInt(parts[1], 10),
    };
  };

  if (cronInterface.type === 'minute') {
    const minute = Number.parseInt(String(cronInterface.minute ?? 1), 10) || 1;
    return `*/${minute} * * * *`;
  }

  if (cronInterface.type === 'hour') {
    const minute = Number.parseInt(String(cronInterface.minute ?? 0), 10) || 0;
    return `${minute} * * * *`;
  }

  if (cronInterface.type === 'day') {
    const timeInfo = parseTime(cronInterface.time);
    const minute = timeInfo?.minute ?? (Number.parseInt(String(cronInterface.minute ?? 0), 10) || 0);
    const hour = timeInfo?.hour ?? (Number.parseInt(String(cronInterface.hour ?? 0), 10) || 0);
    return `${minute} ${hour} * * *`;
  }

  if (cronInterface.type === 'week') {
    const timeInfo = parseTime(cronInterface.time);
    const minute = timeInfo?.minute ?? (Number.parseInt(String(cronInterface.minute ?? 0), 10) || 0);
    const hour = timeInfo?.hour ?? (Number.parseInt(String(cronInterface.hour ?? 0), 10) || 0);
    const dayOfWeeks = cronInterface.dayOfWeeks?.length
      ? cronInterface.dayOfWeeks.map((day) => (Number(day) - 1 + 7) % 7).join(',')
      : '*';
    return `${minute} ${hour} * * ${dayOfWeeks}`;
  }

  if (cronInterface.type === 'month') {
    const timeInfo = parseTime(cronInterface.time);
    const minute = timeInfo?.minute ?? (Number.parseInt(String(cronInterface.minute ?? 0), 10) || 0);
    const hour = timeInfo?.hour ?? (Number.parseInt(String(cronInterface.hour ?? 0), 10) || 0);
    const dayOfMonth = Number.parseInt(String(cronInterface.month ?? 1), 10) || 1;
    return `${minute} ${hour} ${dayOfMonth} * *`;
  }

  return null;
}

export function isEnabledSchedule(item: ScheduleItem): boolean {
  if (item.enabled === false) return false;
  if (item.enabled === 'false') return false;
  if (item.status === 0) return false;
  return true;
}

export function hasPredictableFuture(item: ScheduleItem): boolean {
  const cronInterface = parseCronInterface(item.cronInterface);
  const cronExpression = getCronExpression(cronInterface);
  const nextTime = cronInterface?.nextTime || item.nextTime || item.nextRunTime;
  return Boolean(cronExpression || nextTime);
}

export function getScheduleReadSummary(items: ScheduleItem[]): ScheduleReadSummary {
  const disabled = items.filter((item) => !isEnabledSchedule(item)).length;
  const unschedulable = items.filter((item) => isEnabledSchedule(item) && !hasPredictableFuture(item)).length;
  const schedulable = items.filter((item) => isEnabledSchedule(item) && hasPredictableFuture(item)).length;

  return {
    total: items.length,
    disabled,
    unschedulable,
    schedulable,
  };
}

export function isFinishedStatus(status?: string, statusName?: string): boolean {
  return ['finish', 'finished', 'success'].includes((status || '').toLowerCase())
    || ['完成', '成功'].includes(statusName || '');
}

export function isRunningStatus(status?: string, statusName?: string): boolean {
  return ['running', 'process'].includes((status || '').toLowerCase())
    || ['运行中', '执行中'].includes(statusName || '');
}

export function isWaitingStatus(status?: string, statusName?: string): boolean {
  return ['waiting', 'allocated', 'created'].includes((status || '').toLowerCase())
    || ['等待调度', '排队中', '已分配'].includes(statusName || '');
}

export function getRobotStatusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'running':
      return '运行中';
    case 'idle':
      return '空闲';
    case 'allocated':
      return '已分配';
    case 'connected':
      return '已连接';
    case 'offline':
      return '离线';
    default:
      return status || '未知';
  }
}

export function getTaskClientEffectiveState(record: TaskListRecord, client?: TaskClient): 'running' | 'queued' | null {
  const hasClientStatus = Boolean(client?.clientStatus || client?.clientStatusName);

  if (hasClientStatus && isRunningStatus(client?.clientStatus, client?.clientStatusName)) {
    return 'running';
  }

  if (hasClientStatus && isWaitingStatus(client?.clientStatus, client?.clientStatusName)) {
    return 'queued';
  }

  if (hasClientStatus) return null;

  if (isRunningStatus(record.status, record.statusName)) return 'running';
  if (isWaitingStatus(record.status, record.statusName)) return 'queued';

  return null;
}

export function getTaskRecordStart(record: TaskListRecord): Date | null {
  return parseDateValue(record.startTime || record.taskClients?.[0]?.sceneInstStartTime || record.createTime);
}

export function getTaskRecordEnd(record: TaskListRecord): Date | null {
  return parseDateValue(record.endTime || record.updateTime);
}

export function getTaskDurationMs(record: TaskListRecord, maxReasonableDurationMs: number): number | null {
  if (!isFinishedStatus(record.status, record.statusName)) return null;

  const start = parseDateValue(record.taskClients?.[0]?.sceneInstStartTime)
    || parseDateValue(record.startTime)
    || parseDateValue(record.createTime);
  const end = parseDateValue(record.updateTime) || parseDateValue(record.endTime);

  if (!start || !end || end <= start) return null;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs > maxReasonableDurationMs) return null;

  return durationMs;
}

export function collectRobotNames(detail: Partial<ScheduleDetail>, taskRecords: TaskListRecord[]): string[] {
  return uniqueStrings([
    ...(detail.robotList?.map((item) => item.robotName) || []),
    ...(taskRecords.flatMap((task) => task.taskClients?.map((client) => client.currentRobotName) || [])),
    detail.robotName,
    detail.appName,
  ]);
}

export function collectClientNames(detail: Partial<ScheduleDetail>, taskRecords: TaskListRecord[]): string[] {
  return uniqueStrings([
    ...(detail.robotClientList?.flatMap((item) => [item.robotClientName, item.windowsUserName]) || []),
    ...(detail.robotClientGroupList?.flatMap((item) => [item.robotClientGroupName, item.name]) || []),
    ...(detail.robotGroupList?.flatMap((item) => [item.robotGroupName, item.name]) || []),
    detail.robotClientGroup?.name,
    detail.clientGroupName,
    detail.robotGroupName,
    detail.clientName,
    detail.creatorName,
    detail.ownerName,
    detail.userName,
    ...(taskRecords.flatMap((task) => task.taskClients?.flatMap((client) => [client.robotClientName, client.windowsUserName]) || [])),
  ]);
}
