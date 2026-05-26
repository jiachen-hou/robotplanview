import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfWeek,
  format,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import CronExpressionParser from 'cron-parser';
import { Loader2, Calendar as CalendarIcon, KeyRound, RefreshCw, Bot, ChevronLeft, ChevronRight, Moon, Sun, Users } from 'lucide-react';

import { GanttChart, ScheduleTask, ViewMode } from '@/components/GanttChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface CronInterface {
  type?: string;
  minute?: number;
  hour?: number;
  dayOfWeeks?: number[];
  month?: number;
  time?: string;
  nextTime?: string;
  cronExpress?: string;
}

interface ScheduleItem {
  scheduleUuid: string;
  scheduleName: string;
  scheduleType: string;
  enabled: boolean | string;
  cronInterface?: CronInterface | string;
  nextTime?: string;
  nextRunTime?: string;
  [key: string]: any;
}

interface RobotInfo {
  robotUuid?: string;
  robotName?: string;
}

interface RobotClientInfo {
  uuid?: string;
  robotClientUuid?: string;
  robotClientName?: string;
  statusName?: string;
  windowsUserName?: string;
}

interface RobotClientGroupInfo {
  uuid?: string;
  robotClientGroupUuid?: string;
  robotClientGroupName?: string;
  name?: string;
}

interface RobotGroupInfo {
  uuid?: string;
  robotGroupUuid?: string;
  robotGroupName?: string;
  name?: string;
}

interface HistoricalRun {
  id: string;
  start: Date;
  end: Date;
  status: string;
  robotNames: string[];
  clientNames: string[];
}

interface ScheduleDetail extends ScheduleItem {
  robotList?: RobotInfo[];
  robotClientList?: RobotClientInfo[];
  robotClientGroupList?: RobotClientGroupInfo[];
  robotGroupList?: RobotGroupInfo[];
  robotClientGroup?: {
    uuid?: string;
    name?: string;
  };
  averageDurationMins?: number;
  historicalRuns?: HistoricalRun[];
  completedRunCount?: number;
  derivedRobotNames?: string[];
  derivedClientNames?: string[];
}

interface RobotClient {
  robotClientUuid?: string;
  robotClientName?: string;
  status?: string;
  windowsUserName?: string;
  clientIp?: string;
  machineName?: string;
  clientVersion?: string;
  createTime?: string;
}

interface RobotGroup {
  uuid: string;
  name: string;
}

interface TaskClient {
  robotClientUuid?: string;
  robotClientName?: string;
  currentRobotUuid?: string;
  currentRobotName?: string;
  sceneInstStartTime?: string;
  clientStatus?: string;
  clientStatusName?: string;
  windowsUserName?: string;
}

interface TaskListRecord {
  id?: number | string;
  taskUuid?: string;
  uuid?: string;
  taskName?: string;
  createTime?: string;
  updateTime?: string;
  startTime?: string;
  endTime?: string;
  sourceUuid?: string;
  sourceType?: string;
  status?: string;
  statusName?: string;
  userName?: string;
  taskClients?: TaskClient[];
}

interface RobotJobRecord {
  id?: number | string;
  jobUuid?: string;
  taskUuid?: string;
  taskName?: string;
  status?: string;
  statusName?: string;
  remark?: string;
  triggerTime?: string;
  startTime?: string;
  endTime?: string;
  createTime?: string;
  updateTime?: string;
  sourceUuid?: string;
  robotUuid?: string;
  robotName?: string;
  robotClientUuid?: string;
  robotClientName?: string;
}

interface RealtimeQueueTask {
  taskUuid: string;
  taskName: string;
  scheduleUuid: string;
  scheduleName: string;
  status: 'running' | 'queued';
  robotName?: string;
  startedAt?: string;
  updatedAt?: string;
  lastSeenAt?: number;
}

interface RealtimeQueueRow {
  accountKey: string;
  accountName: string;
  robotClientUuid?: string;
  robotStatus: string;
  robotStatusLabel: string;
  machineName?: string;
  clientIp?: string;
  runningTasks: RealtimeQueueTask[];
  queuedTasks: RealtimeQueueTask[];
}

type QueueStatusFilter = 'all' | 'running' | 'queued';
type RobotStatusFilter = 'all' | 'running' | 'idle' | 'allocated' | 'connected' | 'offline' | 'unknown';
type TimelineGroupBy = 'task' | 'account';
type ThemeMode = 'light' | 'dark';
type DashboardPage = 'overview' | 'realtime' | 'gantt';

interface LoadingProgress {
  phase: 'idle' | 'auth' | 'catalog' | 'hydrating' | 'rendering';
  message: string;
  discoveredSchedules: number;
  processedSchedules: number;
  completedSamples: number;
  averageScheduleMs: number;
  etaSeconds: number | null;
}

interface LoadingActivity {
  scheduleUuid: string;
  scheduleName: string;
  startedAt: number;
}

interface CompletedActivity {
  scheduleUuid: string;
  scheduleName: string;
  durationMs: number;
  successfulSamples: number;
  finishedAt: number;
}

interface SkippedScheduleInfo {
  scheduleUuid: string;
  scheduleName: string;
  reason: 'no_schedule_rule' | 'next_time_in_past' | 'cron_parse_failed' | 'no_future_occurrence_within_horizon';
  cronExpression?: string | null;
  nextTime?: string | null;
}

interface ScheduleReadSummary {
  total: number;
  disabled: number;
  unschedulable: number;
  schedulable: number;
}

export interface ExtendedScheduleTask extends ScheduleTask {
  robotName?: string;
  robotNames?: string[];
  clientName?: string;
  clientNames?: string[];
  actualClientNames?: string[];
  configuredClientNames?: string[];
  groupNames?: string[];
  executionScopeType?: 'account' | 'group' | 'mixed' | 'realtime' | 'unknown';
  executionScopeLabel?: string;
  taskGroupKey?: string;
  isHistorical?: boolean;
  isRealtime?: boolean;
  estimatedEndDate?: Date;
  scheduleUuid?: string;
  cronExpr?: string | null;
}

interface RealtimeTaskScope {
  scheduleName: string;
  scheduleUuid?: string;
  groupNames: string[];
  executionScopeType: ExtendedScheduleTask['executionScopeType'];
  executionScopeLabel: string;
}

interface OverviewScopeCell {
  date: Date;
  total: number;
  running: number;
  queued: number;
  completed: number;
}

interface OverviewScopeRow {
  id: string;
  name: string;
  isGroup: boolean;
  total: number;
  running: number;
  queued: number;
  completed: number;
  cells: OverviewScopeCell[];
}

const SCHEDULE_PAGE_SIZE = 200;
const TASK_PAGE_SIZE = 100;
const RECENT_HISTORY_DAYS = 7;
const FUTURE_DAYS = 30;
const SCHEDULE_CONCURRENCY = 8;
const MAX_SUCCESSFUL_HISTORY_SAMPLES = 10;
const MAX_REASONABLE_HISTORY_DURATION_MS = 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 15000;
const REALTIME_TASK_GRACE_MS = 2 * 60 * 1000;
const REALTIME_JOB_PAGE_SIZE = 50;
const REALTIME_JOB_CONCURRENCY = 1;

const INITIAL_LOADING_PROGRESS: LoadingProgress = {
  phase: 'idle',
  message: '',
  discoveredSchedules: 0,
  processedSchedules: 0,
  completedSamples: 0,
  averageScheduleMs: 0,
  etaSeconds: null,
};

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function matchesAccountKeyword(value: string | undefined, keyword: string): boolean {
  if (!value) return false;
  const normalizedValue = value.trim().toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedValue || !normalizedKeyword) return false;

  if (normalizedValue === normalizedKeyword) return true;

  const accountPart = normalizedValue.split('@')[0];
  return normalizedValue.includes(normalizedKeyword) || accountPart.includes(normalizedKeyword);
}

function normalizeLookupKey(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function formatNamesForLabel(names: string[], emptyText: string): string {
  const uniqueNames = uniqueStrings(names);
  if (uniqueNames.length === 0) return emptyText;
  if (uniqueNames.length <= 2) return uniqueNames.join('、');
  return `${uniqueNames.slice(0, 2).join('、')} 等 ${uniqueNames.length} 个`;
}

function findByLookupKey<T>(lookupMap: ReadonlyMap<string, T>, value?: string | null): T | undefined {
  const key = normalizeLookupKey(value);
  if (!key) return undefined;
  return lookupMap.get(key)
    || [...lookupMap.entries()].find(([name]) => name.includes(key) || key.includes(name))?.[1];
}

function getTaskActualAccountNames(task: ExtendedScheduleTask): string[] {
  const actualNames = uniqueStrings(task.actualClientNames || []);
  if (actualNames.length > 0) return actualNames;

  return uniqueStrings([...(task.clientNames || []), task.clientName]);
}

function getTaskOverviewScopes(task: ExtendedScheduleTask): Array<{ name: string; isGroup: boolean }> {
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

function taskOverlapsRange(task: ExtendedScheduleTask, start: Date, end: Date): boolean {
  return task.startDate <= end && task.endDate >= start;
}

function getScheduleGroupNames(detail: Partial<ScheduleDetail>): string[] {
  return uniqueStrings([
    ...(detail.robotClientGroupList?.flatMap((item) => [item.robotClientGroupName, item.name]) || []),
    ...(detail.robotGroupList?.flatMap((item) => [item.robotGroupName, item.name]) || []),
    detail.robotClientGroup?.name,
    (detail as any).clientGroupName,
    (detail as any).robotGroupName,
  ]);
}

function getScheduleConfiguredAccountNames(detail: Partial<ScheduleDetail>): string[] {
  return uniqueStrings([
    ...(detail.robotClientList?.flatMap((client) => [client.robotClientName, client.windowsUserName]) || []),
  ]);
}

function describeExecutionScope(
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

function parseDateValue(value?: string | number | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return new Date(value > 9999999999 ? value : value * 1000);
  }
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseApiList<T>(payload: any): T[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.dataList)) return payload.data.dataList;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload)) return payload;
  return [];
}


function parseCronInterface(cronInterface?: CronInterface | string | null): CronInterface | null {
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

function getCronExpression(cronInterface?: CronInterface | null): string | null {
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

function isEnabledSchedule(item: ScheduleItem): boolean {
  if (item.enabled === false) return false;
  if (item.enabled === 'false') return false;
  if ((item as any).status === 0) return false;
  return true;
}

function hasPredictableFuture(item: ScheduleItem): boolean {
  const cronInterface = parseCronInterface(item.cronInterface);
  const cronExpression = getCronExpression(cronInterface);
  const nextTime = cronInterface?.nextTime || item.nextTime || item.nextRunTime;
  return Boolean(cronExpression || nextTime);
}

function getScheduleReadSummary(items: ScheduleItem[]): ScheduleReadSummary {
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

function isFinishedStatus(status?: string, statusName?: string): boolean {
  return ['finish', 'finished', 'success'].includes((status || '').toLowerCase())
    || ['完成', '成功'].includes(statusName || '');
}

function isRunningStatus(status?: string, statusName?: string): boolean {
  return ['running', 'process'].includes((status || '').toLowerCase())
    || ['运行中', '执行中'].includes(statusName || '');
}

function isWaitingStatus(status?: string, statusName?: string): boolean {
  return ['waiting', 'allocated', 'created'].includes((status || '').toLowerCase())
    || ['等待调度', '排队中', '已分配'].includes(statusName || '');
}

function getRobotStatusLabel(status?: string): string {
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

function getTaskClientEffectiveState(record: TaskListRecord, client?: TaskClient): 'running' | 'queued' | null {
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

function getTaskRecordStart(record: TaskListRecord): Date | null {
  return parseDateValue(record.startTime || record.taskClients?.[0]?.sceneInstStartTime || record.createTime);
}

function getTaskRecordEnd(record: TaskListRecord): Date | null {
  return parseDateValue(record.endTime || record.updateTime);
}

function getTaskDurationMs(record: TaskListRecord): number | null {
  if (!isFinishedStatus(record.status, record.statusName)) return null;

  const start = parseDateValue(record.taskClients?.[0]?.sceneInstStartTime)
    || parseDateValue(record.startTime)
    || parseDateValue(record.createTime);
  const end = parseDateValue(record.updateTime) || parseDateValue(record.endTime);

  if (!start || !end || end <= start) return null;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs > MAX_REASONABLE_HISTORY_DURATION_MS) return null;

  return durationMs;
}

function collectRobotNames(detail: Partial<ScheduleDetail>, taskRecords: TaskListRecord[]): string[] {
  return uniqueStrings([
    ...(detail.robotList?.map((item) => item.robotName) || []),
    ...(taskRecords.flatMap((task) => task.taskClients?.map((client) => client.currentRobotName) || [])),
    detail.robotName,
    detail.appName,
  ]);
}

function collectClientNames(detail: Partial<ScheduleDetail>, taskRecords: TaskListRecord[]): string[] {
  return uniqueStrings([
    ...(detail.robotClientList?.flatMap((item) => [item.robotClientName, item.windowsUserName]) || []),
    ...(detail.robotClientGroupList?.flatMap((item) => [item.robotClientGroupName, item.name]) || []),
    ...(detail.robotGroupList?.flatMap((item) => [item.robotGroupName, item.name]) || []),
    detail.robotClientGroup?.name,
    (detail as any).clientGroupName,
    (detail as any).robotGroupName,
    (detail as any).clientName,
    (detail as any).creatorName,
    (detail as any).ownerName,
    (detail as any).userName,
    ...(taskRecords.flatMap((task) => task.taskClients?.flatMap((client) => [client.robotClientName, client.windowsUserName]) || [])),
  ]);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

export default function App() {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [accessKeySecret, setAccessKeySecret] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [schedules, setSchedules] = useState<ScheduleDetail[]>([]);
  const [tasks, setTasks] = useState<ExtendedScheduleTask[]>([]);
  const [robotClients, setRobotClients] = useState<RobotClient[]>([]);
  const [robotGroups, setRobotGroups] = useState<RobotGroup[]>([]);
  const [realtimeQueueRows, setRealtimeQueueRows] = useState<RealtimeQueueRow[]>([]);
  const [scheduleReadSummary, setScheduleReadSummary] = useState<ScheduleReadSummary>({
    total: 0,
    disabled: 0,
    unschedulable: 0,
    schedulable: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>(INITIAL_LOADING_PROGRESS);
  const [activeSchedules, setActiveSchedules] = useState<LoadingActivity[]>([]);
  const [recentlyCompletedSchedules, setRecentlyCompletedSchedules] = useState<CompletedActivity[]>([]);
  const [skippedSchedules, setSkippedSchedules] = useState<SkippedScheduleInfo[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<QueueStatusFilter>('all');
  const [robotStatusFilter, setRobotStatusFilter] = useState<RobotStatusFilter>('all');
  const [queueSearchTerm, setQueueSearchTerm] = useState('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [clockNow, setClockNow] = useState(() => new Date());

  const [dashboardPage, setDashboardPage] = useState<DashboardPage>('overview');
  const [viewMode, setViewMode] = useState<ViewMode>('Week');
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>('task');
  const [currentDate, setCurrentDate] = useState(new Date());
  const loadingRef = useRef(false);
  const schedulesRef = useRef<ScheduleDetail[]>([]);
  const realtimeQueueRowsRef = useRef<RealtimeQueueRow[]>([]);
  const snapshotRefreshingRef = useRef(false);

  useEffect(() => {
    const savedId = localStorage.getItem('yingdao_ak_id');
    const savedSecret = localStorage.getItem('yingdao_ak_secret');
    const savedTheme = localStorage.getItem('robotplanview_theme');
    if (savedId) setAccessKeyId(savedId);
    if (savedSecret) setAccessKeySecret(savedSecret);
    if (savedTheme === 'dark' || savedTheme === 'light') setThemeMode(savedTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem('robotplanview_theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  useEffect(() => {
    realtimeQueueRowsRef.current = realtimeQueueRows;
  }, [realtimeQueueRows]);

  useEffect(() => {
    if (!token) return undefined;

    const intervalId = window.setInterval(() => {
      if (loadingRef.current) return;

      refreshDashboard(token, 'incremental').catch((err) => {
        console.error('Auto refresh failed', err);
      });
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [token]);

  const postWithRetry = async <T = any>(url: string, data: any, maxRetries = 5): Promise<T> => {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await axios.post<T>(url, data);
        const body: any = response.data;
        if (body?.code === 429) {
          throw { response: { status: 429, data: body } };
        }
        return response.data;
      } catch (err: any) {
        const isRateLimited = err.response?.status === 429 || err.response?.data?.code === 429;
        if (!isRateLimited || attempt === maxRetries - 1) {
          throw err;
        }

        const waitMs = Math.pow(2, attempt + 1) * 1000 + Math.round(Math.random() * 500);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        attempt += 1;
      }
    }

    throw new Error(`请求 ${url} 失败`);
  };

  const fetchRobotClients = async (accessToken: string): Promise<RobotClient[]> => {
    const allClients: RobotClient[] = [];
    let page = 1;

    while (true) {
      const response: any = await postWithRetry('/api/yingdao/client/list', {
        token: accessToken,
        payload: { page, size: 500 },
      });

      const list = parseApiList<RobotClient>(response);
      if (!list.length) break;

      allClients.push(...list);
      if (list.length < 500) break;
      page += 1;
    }

    setRobotClients(allClients);
    return allClients;
  };

  const fetchRobotGroups = async (accessToken: string): Promise<RobotGroup[]> => {
    const allGroups: RobotGroup[] = [];
    let page = 1;

    while (true) {
      const response: any = await postWithRetry('/api/yingdao/client/group/list', {
        token: accessToken,
        payload: { page, size: 500 },
      });

      const list = parseApiList<any>(response);
      if (!list.length) break;

      allGroups.push(
        ...list
          .map((item) => ({
            uuid: item.robotClientGroupUuid || item.uuid,
            name: item.robotClientGroupName || item.name,
          }))
          .filter((item) => item.uuid && item.name),
      );

      if (list.length < 500) break;
      page += 1;
    }

    setRobotGroups(allGroups);
    return allGroups;
  };

  const fetchAllSchedules = async (accessToken: string): Promise<ScheduleItem[]> => {
    const allSchedules: ScheduleItem[] = [];
    let page = 1;

    while (true) {
      const response: any = await postWithRetry('/api/yingdao/schedule/list', {
        token: accessToken,
        payload: { page, size: SCHEDULE_PAGE_SIZE },
      });

      const list = parseApiList<ScheduleItem>(response);
      if (!list.length) {
        if (page === 1) {
          const fallbackResponse: any = await postWithRetry('/api/yingdao/schedule/list', {
            token: accessToken,
            payload: {},
          });
          const fallbackList = parseApiList<ScheduleItem>(fallbackResponse);
          if (fallbackList.length) {
            allSchedules.push(...fallbackList);
          }
        }
        break;
      }

      allSchedules.push(...list);

      const totalPages = response?.page?.pages || response?.data?.page?.pages;
      if ((typeof totalPages === 'number' && page >= totalPages) || list.length < SCHEDULE_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    return allSchedules;
  };

  const fetchAllTaskRecords = async (accessToken: string, scheduleUuid: string): Promise<TaskListRecord[]> => {
    const records: TaskListRecord[] = [];
    const seenTaskUuids = new Set<string>();
    let nextId: number | string | undefined;
    let previousNextId: number | string | undefined;
    let hasMore = true;
    let guard = 0;
    let successfulSamples = 0;

    while (hasMore && guard < 200 && successfulSamples < MAX_SUCCESSFUL_HISTORY_SAMPLES) {
      const response: any = await postWithRetry('/api/yingdao/task/list', {
        token: accessToken,
        payload: {
          sourceUuid: scheduleUuid,
          cursorDirection: 'next',
          size: TASK_PAGE_SIZE,
          ...(nextId ? { nextId } : {}),
        },
      });

      const data = response?.data;
      const pageRecords = Array.isArray(data?.dataList)
        ? data.dataList
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

      if (!pageRecords.length) break;

      const deduped = pageRecords.filter((item: TaskListRecord) => {
        const taskUuid = String(item.taskUuid || item.uuid || '');
        if (!taskUuid || seenTaskUuids.has(taskUuid)) return false;
        seenTaskUuids.add(taskUuid);
        return true;
      });

      records.push(...deduped);
      successfulSamples += deduped.filter((record) => getTaskDurationMs(record) !== null).length;
      const nextCursor = data?.nextId;
      const isStagnantCursor = Boolean(nextCursor && previousNextId && String(nextCursor) === String(previousNextId));
      const hasNoNewRecords = deduped.length === 0;

      if (
        successfulSamples >= MAX_SUCCESSFUL_HISTORY_SAMPLES
        || data?.hasData === false
        || !nextCursor
        || pageRecords.length < TASK_PAGE_SIZE
        || isStagnantCursor
        || hasNoNewRecords
      ) {
        hasMore = false;
      } else {
        previousNextId = nextCursor;
        nextId = nextCursor;
      }

      guard += 1;
    }

    return records;
  };

  const fetchRobotJobQueue = async (accessToken: string, robotClientUuid: string): Promise<RobotJobRecord[]> => {
    const records: RobotJobRecord[] = [];
    const seenJobs = new Set<string>();

    const response: any = await postWithRetry('/api/yingdao/job/list', {
      token: accessToken,
      payload: {
        robotClientUuid,
        cursorDirection: 'next',
        size: REALTIME_JOB_PAGE_SIZE,
      },
    }, 3);

    const pageRecords = parseApiList<RobotJobRecord>(response);
    pageRecords.forEach((record) => {
      const key = String(record.jobUuid || record.id || `${record.taskName || 'job'}-${record.triggerTime || record.startTime || ''}`);
      if (!key || seenJobs.has(key)) return;
      seenJobs.add(key);
      records.push(record);
    });

    return records;
  };

  const buildRealtimeQueueRows = async (
    accessToken: string,
    clientList: RobotClient[],
  ): Promise<RealtimeQueueRow[]> => {
    const rows = await mapWithConcurrency(clientList, REALTIME_JOB_CONCURRENCY, async (client) => {
      const robotClientUuid = client.robotClientUuid;
      if (!robotClientUuid) return null;

      const previousRow = realtimeQueueRowsRef.current.find((row) => row.accountKey === robotClientUuid);
      let jobRecords: RobotJobRecord[] = [];
      let jobQueryFailed = false;
      try {
        jobRecords = await fetchRobotJobQueue(accessToken, robotClientUuid);
      } catch (err) {
        jobQueryFailed = true;
        console.warn(`查询机器人任务队列失败: ${client.robotClientName || robotClientUuid}`, err);
      }

      const row: RealtimeQueueRow = {
        accountKey: robotClientUuid,
        accountName: client.robotClientName || client.windowsUserName || robotClientUuid,
        robotClientUuid,
        robotStatus: client.status || '',
        robotStatusLabel: getRobotStatusLabel(client.status),
        machineName: client.machineName,
        clientIp: client.clientIp,
        runningTasks: [],
        queuedTasks: [],
      };

      if (jobQueryFailed && previousRow) {
        return {
          ...row,
          runningTasks: previousRow.runningTasks,
          queuedTasks: previousRow.queuedTasks,
        };
      }

      jobRecords.forEach((job) => {
        const state = isRunningStatus(job.status, job.statusName)
          ? 'running'
          : isWaitingStatus(job.status, job.statusName)
            ? 'queued'
            : null;
        if (!state) return;

        const taskUuid = String(job.jobUuid || job.id || `${robotClientUuid}-${job.taskName || 'job'}-${job.triggerTime || job.startTime || ''}`);
        const startedAt = job.startTime || job.triggerTime || job.createTime || job.updateTime || new Date().toISOString();
        const updatedAt = job.updateTime || job.triggerTime || job.startTime || job.createTime || new Date().toISOString();
        const queueTask: RealtimeQueueTask = {
          taskUuid,
          taskName: job.taskName || '未命名任务',
          scheduleUuid: String(job.sourceUuid || job.taskUuid || ''),
          scheduleName: job.taskName || '未命名任务',
          status: state,
          robotName: job.robotName,
          startedAt,
          updatedAt,
          lastSeenAt: Date.now(),
        };

        const targetList = state === 'running' ? row.runningTasks : row.queuedTasks;
        if (!targetList.some((item) => item.taskUuid === queueTask.taskUuid)) {
          targetList.push(queueTask);
        }
      });

      row.runningTasks.sort((left, right) =>
        (parseDateValue(right.startedAt)?.getTime() || 0) - (parseDateValue(left.startedAt)?.getTime() || 0),
      );
      row.runningTasks = row.runningTasks.slice(0, 1);
      row.queuedTasks.sort((left, right) =>
        (parseDateValue(left.updatedAt)?.getTime() || 0) - (parseDateValue(right.updatedAt)?.getTime() || 0),
      );

      return row;
    });

    return rows
      .filter((row): row is RealtimeQueueRow => row !== null)
      .sort((left, right) => {
        const rightWeight = right.runningTasks.length * 1000 + right.queuedTasks.length;
        const leftWeight = left.runningTasks.length * 1000 + left.queuedTasks.length;
        if (rightWeight !== leftWeight) return rightWeight - leftWeight;
        return left.accountName.localeCompare(right.accountName, 'zh-CN');
      });
  };

  const mergeRealtimeRowsWithGrace = (nextRows: RealtimeQueueRow[]): RealtimeQueueRow[] => {
    const now = Date.now();
    const previousRows = new Map<string, RealtimeQueueRow>(
      realtimeQueueRowsRef.current.map((row) => [row.accountKey, row]),
    );

    return nextRows.map((row) => {
      const previous = previousRows.get(row.accountKey);
      if (!previous || row.runningTasks.length > 0 || previous.runningTasks.length === 0) {
        return row;
      }

      const stillFreshRunningTasks = previous.runningTasks.filter((task) => {
        const lastSeenAt = task.lastSeenAt || 0;
        return now - lastSeenAt <= REALTIME_TASK_GRACE_MS;
      });

      if (stillFreshRunningTasks.length === 0) return row;

      return {
        ...row,
        runningTasks: stillFreshRunningTasks,
      };
    });
  };

  const hydrateSchedule = async (item: ScheduleItem, accessToken: string): Promise<ScheduleDetail> => {
    const scheduleUuid = item.scheduleUuid || (item as any).uuid || (item as any).id;
    const cronInterface = parseCronInterface(item.cronInterface);

    let detailData: Partial<ScheduleDetail> = {};
    const hasRobotDetails = Boolean(
      (item as any).robotList
      || (item as any).robotClientList
      || (item as any).robotClientGroupList
      || (item as any).robotGroupList
      || (item as any).robotClientGroup,
    );

    if (!hasRobotDetails || !cronInterface) {
      try {
        const detailResponse: any = await postWithRetry('/api/yingdao/schedule/detail', {
          token: accessToken,
          scheduleUuid,
        });
        detailData = detailResponse?.data || {};
      } catch (err) {
        console.warn(`查询任务详情失败: ${scheduleUuid}`, err);
      }
    }

    const taskRecords = await fetchAllTaskRecords(accessToken, scheduleUuid);
    const completedDurations = taskRecords
      .map((record) => getTaskDurationMs(record))
      .filter((duration): duration is number => typeof duration === 'number');

    const averageDurationMins = completedDurations.length
      ? Math.max(1, Math.round(completedDurations.reduce((sum, current) => sum + current, 0) / completedDurations.length / 60000))
      : 1;

    const sevenDaysAgo = Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    const recentRuns: HistoricalRun[] = [];

    taskRecords.forEach((record) => {
      if (!isFinishedStatus(record.status, record.statusName)) return;

      const taskUuid = String(record.taskUuid || record.uuid || '');
      const start = getTaskRecordStart(record);
      const end = getTaskRecordEnd(record);

      if (!start || !end || end <= start) return;
      if (end.getTime() - start.getTime() > MAX_REASONABLE_HISTORY_DURATION_MS) return;
      if (start.getTime() < sevenDaysAgo && end.getTime() < sevenDaysAgo) return;

      recentRuns.push({
        id: taskUuid || String(record.id || `${scheduleUuid}-${recentRuns.length}`),
        start,
        end,
        status: record.status || record.statusName || 'unknown',
        robotNames: uniqueStrings(record.taskClients?.map((client) => client.currentRobotName) || []),
        clientNames: uniqueStrings([
          ...(record.taskClients?.map((client) => client.robotClientName) || []),
          record.userName,
        ]),
      });
    });

    recentRuns.sort((a, b) => a.start.getTime() - b.start.getTime());

    return {
      ...item,
      ...detailData,
      cronInterface: parseCronInterface(detailData.cronInterface) || cronInterface || undefined,
      averageDurationMins,
      historicalRuns: recentRuns,
      completedRunCount: completedDurations.length,
      robotList: detailData.robotList || (item as any).robotList,
      robotClientList: detailData.robotClientList || (item as any).robotClientList,
      robotClientGroupList: detailData.robotClientGroupList || (item as any).robotClientGroupList,
      robotGroupList: detailData.robotGroupList || (item as any).robotGroupList,
      robotClientGroup: detailData.robotClientGroup || (item as any).robotClientGroup,
      derivedRobotNames: collectRobotNames(detailData, taskRecords),
      derivedClientNames: collectClientNames(detailData, taskRecords),
    } as ScheduleDetail;
  };

  const generateTasks = (items: ScheduleDetail[]) => {
    const nextTasks: ExtendedScheduleTask[] = [];
    const skipped: SkippedScheduleInfo[] = [];
    const now = new Date();
    const horizon = addDays(now, FUTURE_DAYS);

    items.forEach((item) => {
      const cronInterface = parseCronInterface(item.cronInterface);
      const cronExpression = getCronExpression(cronInterface);
      const nextTime = cronInterface?.nextTime || item.nextTime || item.nextRunTime;

      const robotNames = uniqueStrings([
        ...(item.robotList?.map((robot) => robot.robotName) || []),
        ...(item.derivedRobotNames || []),
        (item as any).robotName,
        (item as any).appName,
      ]);
      const configuredAccountNames = getScheduleConfiguredAccountNames(item);
      const groupNames = getScheduleGroupNames(item);
      const observedClientNames = uniqueStrings([
        ...(item.derivedClientNames || []),
        (item as any).clientName,
        (item as any).creatorName,
      ]);
      const clientNames = uniqueStrings([
        ...configuredAccountNames,
        ...observedClientNames,
      ]);
      const { executionScopeType, executionScopeLabel } = describeExecutionScope(
        groupNames,
        configuredAccountNames,
        clientNames,
      );
      const taskGroupKey = item.scheduleUuid || `schedule-${normalizeLookupKey(item.scheduleName)}`;

      const robotName = robotNames[0] || '未知应用';
      const clientName = clientNames[0] || (groupNames.length > 0 ? '从机器人组分配' : '未指定账号');

      item.historicalRuns?.forEach((run) => {
        const status: ExtendedScheduleTask['status'] = isFinishedStatus(run.status)
          ? 'completed'
          : isRunningStatus(run.status)
            ? 'running'
            : 'failed';
        const actualClientNames = uniqueStrings(run.clientNames);
        const historicalClientNames = actualClientNames.length > 0 ? actualClientNames : clientNames;

        nextTasks.push({
          id: `hist-${item.scheduleUuid}-${run.id}`,
          name: item.scheduleName || 'Unnamed schedule',
          startDate: run.start,
          endDate: run.end,
          status,
          robotName,
          robotNames: uniqueStrings([...robotNames, ...run.robotNames]),
          clientName: historicalClientNames[0] || clientName,
          clientNames: historicalClientNames,
          actualClientNames,
          configuredClientNames: configuredAccountNames,
          groupNames,
          executionScopeType,
          executionScopeLabel,
          taskGroupKey,
          isHistorical: true,
          scheduleUuid: item.scheduleUuid,
          cronExpr: null,
        });
      });

      if (!cronExpression) {
        if (nextTime) {
          const start = parseDateValue(nextTime);
          if (start && start >= now) {
            nextTasks.push({
              id: `${item.scheduleUuid}-next`,
              name: item.scheduleName || 'Unnamed schedule',
              startDate: start,
              endDate: new Date(start.getTime() + (item.averageDurationMins || 1) * 60000),
              status: 'pending',
              robotName,
              robotNames,
              clientName,
              clientNames,
              configuredClientNames: configuredAccountNames,
              groupNames,
              executionScopeType,
              executionScopeLabel,
              taskGroupKey,
              scheduleUuid: item.scheduleUuid,
              cronExpr: null,
            });
          } else {
            skipped.push({
              scheduleUuid: item.scheduleUuid,
              scheduleName: item.scheduleName || 'Unnamed schedule',
              reason: 'next_time_in_past',
              nextTime,
            });
          }
        } else {
          skipped.push({
            scheduleUuid: item.scheduleUuid,
            scheduleName: item.scheduleName || 'Unnamed schedule',
            reason: 'no_schedule_rule',
            nextTime: nextTime || null,
          });
        }
        return;
      }

      try {
        const iterator = CronExpressionParser.parse(cronExpression, { currentDate: now });
        let count = 0;

        while (count < 1000) {
          const start = iterator.next().toDate();
          if (start > horizon) break;

          nextTasks.push({
            id: `${item.scheduleUuid}-${count}`,
            name: item.scheduleName || 'Unnamed schedule',
            startDate: start,
            endDate: new Date(start.getTime() + (item.averageDurationMins || 1) * 60000),
            status: 'pending',
            robotName,
            robotNames,
            clientName,
            clientNames,
            configuredClientNames: configuredAccountNames,
            groupNames,
            executionScopeType,
            executionScopeLabel,
            taskGroupKey,
            scheduleUuid: item.scheduleUuid,
            cronExpr: cronExpression,
          });

          count += 1;
        }
        if (count === 0) {
          const fallbackStart = parseDateValue(nextTime);
          if (fallbackStart && fallbackStart >= now) {
            nextTasks.push({
              id: `${item.scheduleUuid}-next-fallback`,
              name: item.scheduleName || 'Unnamed schedule',
              startDate: fallbackStart,
              endDate: new Date(fallbackStart.getTime() + (item.averageDurationMins || 1) * 60000),
              status: 'pending',
              robotName,
              robotNames,
              clientName,
              clientNames,
              configuredClientNames: configuredAccountNames,
              groupNames,
              executionScopeType,
              executionScopeLabel,
              taskGroupKey,
              scheduleUuid: item.scheduleUuid,
              cronExpr: cronExpression,
            });
          } else {
            skipped.push({
              scheduleUuid: item.scheduleUuid,
              scheduleName: item.scheduleName || 'Unnamed schedule',
              reason: 'no_future_occurrence_within_horizon',
              cronExpression,
              nextTime: nextTime || null,
            });
          }
        }
      } catch (err) {
        console.warn(`解析 cron 失败: ${item.scheduleName}`, err);
      }
    });

    nextTasks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setTasks(nextTasks);
    setSkippedSchedules(skipped);
  };

  const syncDashboardSnapshot = async (accessToken: string) => {
    const [allSchedules, clientList] = await Promise.all([
      fetchAllSchedules(accessToken),
      fetchRobotClients(accessToken),
      fetchRobotGroups(accessToken),
    ]);
    setScheduleReadSummary(getScheduleReadSummary(allSchedules));

    const existingSchedules = new Map<string, ScheduleDetail>(
      schedulesRef.current
        .filter((item): item is ScheduleDetail & { scheduleUuid: string } => Boolean(item.scheduleUuid))
        .map((item) => [item.scheduleUuid, item]),
    );

    const mergedSchedules = allSchedules
      .filter((item) => isEnabledSchedule(item) && hasPredictableFuture(item))
      .map((item) => {
        const existing = existingSchedules.get(item.scheduleUuid);
        if (!existing) {
          return {
            ...item,
            cronInterface: parseCronInterface(item.cronInterface) || undefined,
            averageDurationMins: 1,
            historicalRuns: [],
            completedRunCount: 0,
          } as ScheduleDetail;
        }

        return {
          ...existing,
          ...item,
          cronInterface: parseCronInterface(item.cronInterface) || existing.cronInterface || undefined,
        } as ScheduleDetail;
      })
      .sort((left, right) => String(left.scheduleName || '').localeCompare(String(right.scheduleName || ''), 'zh-CN'));

    setSchedules(mergedSchedules);
    generateTasks(mergedSchedules);
    const queueRows = await buildRealtimeQueueRows(accessToken, clientList);
    setRealtimeQueueRows(mergeRealtimeRowsWithGrace(queueRows));
    setLastUpdatedAt(new Date());
  };

  const syncRealtimeSnapshot = async (accessToken: string) => {
    const clientList = await fetchRobotClients(accessToken);
    const queueRows = await buildRealtimeQueueRows(accessToken, clientList);
    setRealtimeQueueRows(mergeRealtimeRowsWithGrace(queueRows));
    setLastUpdatedAt(new Date());
  };

  const refreshDashboard = async (accessToken: string, mode: 'full' | 'incremental' = 'full') => {
    if (mode === 'incremental') {
      if (snapshotRefreshingRef.current) return;
      snapshotRefreshingRef.current = true;
      try {
        await syncRealtimeSnapshot(accessToken);
      } finally {
        snapshotRefreshingRef.current = false;
      }
      return;
    }

    setLoading(true);
    setError('');
    setActiveSchedules([]);
    setRecentlyCompletedSchedules([]);
    setScheduleReadSummary({ total: 0, disabled: 0, unschedulable: 0, schedulable: 0 });
    setLoadingProgress({
      ...INITIAL_LOADING_PROGRESS,
      phase: 'catalog',
      message: '正在读取任务目录和机器人信息...',
    });

    try {
      const [allSchedules, clientList] = await Promise.all([
        fetchAllSchedules(accessToken),
        fetchRobotClients(accessToken),
        fetchRobotGroups(accessToken),
      ]);
      setScheduleReadSummary(getScheduleReadSummary(allSchedules));

      const queueRows = await buildRealtimeQueueRows(accessToken, clientList);
      setRealtimeQueueRows(mergeRealtimeRowsWithGrace(queueRows));

      const predictableSchedules = allSchedules.filter((item) => isEnabledSchedule(item) && hasPredictableFuture(item));
      setLoadingProgress({
        phase: 'hydrating',
        message: '正在计算每个任务的历史平均运行时长...',
        discoveredSchedules: predictableSchedules.length,
        processedSchedules: 0,
        completedSamples: 0,
        averageScheduleMs: 0,
        etaSeconds: null,
      });

      let processedSchedules = 0;
      let completedSamples = 0;
      let totalScheduleMs = 0;
      const partialSchedules: ScheduleDetail[] = [];

      const hydratedSchedules = await mapWithConcurrency(
        predictableSchedules,
        SCHEDULE_CONCURRENCY,
        async (item) => {
          const startedAt = Date.now();
          setActiveSchedules((current) => [
            ...current,
            {
              scheduleUuid: item.scheduleUuid,
              scheduleName: item.scheduleName || 'Unnamed schedule',
              startedAt,
            },
          ]);
          const hydrated = await hydrateSchedule(item, accessToken);
          const durationMs = Date.now() - startedAt;

          processedSchedules += 1;
          completedSamples += hydrated.completedRunCount || 0;
          totalScheduleMs += durationMs;

          const averageScheduleMs = processedSchedules > 0 ? totalScheduleMs / processedSchedules : 0;
          const remainingSchedules = Math.max(0, predictableSchedules.length - processedSchedules);
          const etaSeconds = processedSchedules > 0
            ? Math.max(0, Math.round((remainingSchedules * averageScheduleMs) / Math.max(1, SCHEDULE_CONCURRENCY) / 1000))
            : null;

          partialSchedules.push(hydrated);
          const sortedPartialSchedules = [...partialSchedules].sort((left, right) =>
            String(left.scheduleName || '').localeCompare(String(right.scheduleName || ''), 'zh-CN'),
          );
          setSchedules(sortedPartialSchedules);
          generateTasks(sortedPartialSchedules);
          setActiveSchedules((current) => current.filter((entry) => entry.scheduleUuid !== item.scheduleUuid));
          setRecentlyCompletedSchedules((current) => [
            {
              scheduleUuid: item.scheduleUuid,
              scheduleName: item.scheduleName || 'Unnamed schedule',
              durationMs,
              successfulSamples: hydrated.completedRunCount || 0,
              finishedAt: Date.now(),
            },
            ...current,
          ].slice(0, 50));

          setLoadingProgress({
            phase: 'hydrating',
            message: '正在计算每个任务的历史平均运行时长...',
            discoveredSchedules: predictableSchedules.length,
            processedSchedules,
            completedSamples,
            averageScheduleMs: Math.round(averageScheduleMs),
            etaSeconds,
          });

          return hydrated;
        },
      );

      setLoadingProgress((current) => ({
        ...current,
        phase: 'rendering',
        message: '正在生成未来计划和甘特图...',
        etaSeconds: null,
      }));
      setSchedules(hydratedSchedules);
      generateTasks(hydratedSchedules);
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || '获取任务数据失败');
    } finally {
      setLoading(false);
      setLoadingProgress(INITIAL_LOADING_PROGRESS);
      setActiveSchedules([]);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!accessKeyId || !accessKeySecret) {
      setError('请输入 Access Key ID 和 Secret');
      return;
    }

    setLoading(true);
    setError('');
    setLoadingProgress({
      ...INITIAL_LOADING_PROGRESS,
      phase: 'auth',
      message: '正在鉴权并建立访问会话...',
    });

    try {
      const tokenResponse = await axios.post('/api/yingdao/token', {
        accessKeyId,
        accessKeySecret,
      });

      const accessToken = tokenResponse.data?.data?.accessToken
        || tokenResponse.data?.data?.token
        || tokenResponse.data?.accessToken
        || tokenResponse.data?.token;

      if (!accessToken) {
        throw new Error('无法从鉴权响应中解析 access token');
      }

      setToken(accessToken);
      localStorage.setItem('yingdao_ak_id', accessKeyId);
      localStorage.setItem('yingdao_ak_secret', accessKeySecret);

      await refreshDashboard(accessToken);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || '认证失败');
      setLoading(false);
    }
  };

  const handlePrevPeriod = () => {
    switch (viewMode) {
      case 'Day':
        setCurrentDate((value) => subDays(value, 1));
        break;
      case 'Week':
        setCurrentDate((value) => subWeeks(value, 1));
        break;
      case 'Month':
        setCurrentDate((value) => subMonths(value, 1));
        break;
      case 'Year':
        setCurrentDate((value) => subYears(value, 1));
        break;
    }
  };

  const handleNextPeriod = () => {
    switch (viewMode) {
      case 'Day':
        setCurrentDate((value) => addDays(value, 1));
        break;
      case 'Week':
        setCurrentDate((value) => addWeeks(value, 1));
        break;
      case 'Month':
        setCurrentDate((value) => addMonths(value, 1));
        break;
      case 'Year':
        setCurrentDate((value) => addYears(value, 1));
        break;
    }
  };

  const currentPeriodLabel = useMemo(() => {
    switch (viewMode) {
      case 'Day':
        return format(currentDate, 'yyyy-MM-dd', { locale: zhCN });
      case 'Week': {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(start, 'yyyy-MM-dd', { locale: zhCN })} - ${format(end, 'MM-dd', { locale: zhCN })}`;
      }
      case 'Month':
        return format(currentDate, 'yyyy-MM', { locale: zhCN });
      case 'Year':
        return format(currentDate, 'yyyy', { locale: zhCN });
      default:
        return '';
    }
  }, [currentDate, viewMode]);

  const loadingSummary = useMemo(() => {
    if (loadingProgress.phase === 'idle') return null;

    const percent = loadingProgress.discoveredSchedules > 0
      ? Math.min(100, Math.round((loadingProgress.processedSchedules / loadingProgress.discoveredSchedules) * 100))
      : 0;

    const etaText = loadingProgress.etaSeconds === null
      ? 'Estimating remaining time'
      : loadingProgress.etaSeconds < 60
        ? `ETA ${loadingProgress.etaSeconds}s`
        : `ETA ${Math.ceil(loadingProgress.etaSeconds / 60)} min`;

    return {
      percent,
      etaText,
    };
  }, [loadingProgress]);

  const activeScheduleSummary = useMemo(
    () => activeSchedules
      .map((item) => ({
        ...item,
        runningSeconds: Math.max(0, Math.round((Date.now() - item.startedAt) / 1000)),
      }))
      .sort((left, right) => right.runningSeconds - left.runningSeconds)
      .slice(0, 6),
    [activeSchedules],
  );

  const robotStatusSummary = useMemo(() => {
    const counts: Record<string, number> = {
      connected: 0,
      idle: 0,
      allocated: 0,
      running: 0,
      offline: 0,
      unknown: 0,
    };

    robotClients.forEach((client) => {
      const status = String(client.status || '').toLowerCase();
      if (status in counts) {
        counts[status] += 1;
      } else {
        counts.unknown += 1;
      }
    });

    return counts;
  }, [robotClients]);

  const robotStatusRows = useMemo(
    () => robotClients
      .slice()
      .sort((left, right) => String(left.robotClientName || '').localeCompare(String(right.robotClientName || ''), 'zh-CN'))
      .slice(0, 12),
    [robotClients],
  );

  const skippedScheduleSummary = useMemo(
    () => skippedSchedules.slice(0, 8).map((item) => ({
      ...item,
      reasonText:
        item.reason === 'next_time_in_past'
          ? 'nextTime 已经过期'
          : item.reason === 'cron_parse_failed'
            ? 'cron parse failed'
            : item.reason === 'no_future_occurrence_within_horizon'
              ? `${FUTURE_DAYS} days no future run`
              : 'missing schedulable rule',
    })),
    [skippedSchedules],
  );

  const slowestCompletedSummary = useMemo(
    () => recentlyCompletedSchedules
      .slice()
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 8),
    [recentlyCompletedSchedules],
  );

  const averageDurationByTaskName = useMemo(() => {
    const durationMap = new Map<string, number>();

    schedules.forEach((item) => {
      const key = normalizeLookupKey(item.scheduleName);
      if (!key || !item.averageDurationMins) return;
      durationMap.set(key, item.averageDurationMins);
    });

    return durationMap;
  }, [schedules]);

  const scheduleByTaskName = useMemo<Map<string, ScheduleDetail>>(() => {
    const scheduleMap = new Map<string, ScheduleDetail>();

    schedules.forEach((item) => {
      const key = normalizeLookupKey(item.scheduleName);
      if (key && !scheduleMap.has(key)) {
        scheduleMap.set(key, item);
      }
    });

    return scheduleMap;
  }, [schedules]);

  const realtimeTaskScopeByName = useMemo<Map<string, RealtimeTaskScope>>(() => {
    const scopeMap = new Map<string, RealtimeTaskScope>();

    schedules.forEach((item) => {
      const key = normalizeLookupKey(item.scheduleName);
      if (!key || scopeMap.has(key)) return;

      const groupNames = getScheduleGroupNames(item);
      const configuredAccountNames = getScheduleConfiguredAccountNames(item);
      const observedClientNames = uniqueStrings([
        ...(item.derivedClientNames || []),
        (item as any).clientName,
        (item as any).creatorName,
      ]);
      const clientNames = uniqueStrings([
        ...configuredAccountNames,
        ...observedClientNames,
      ]);
      const { executionScopeType, executionScopeLabel } = describeExecutionScope(
        groupNames,
        configuredAccountNames,
        clientNames,
      );

      scopeMap.set(key, {
        scheduleName: item.scheduleName || '未命名任务',
        scheduleUuid: item.scheduleUuid,
        groupNames,
        executionScopeType,
        executionScopeLabel,
      });
    });

    return scopeMap;
  }, [schedules]);

  const getRealtimeTaskScope = (task?: RealtimeQueueTask): RealtimeTaskScope | undefined =>
    task ? findByLookupKey<RealtimeTaskScope>(realtimeTaskScopeByName, task.taskName || task.scheduleName) : undefined;

  const realtimeRunningTimelineTasks = useMemo<ExtendedScheduleTask[]>(() => {
    return realtimeQueueRows.flatMap((row) =>
      row.runningTasks
        .map((task) => {
          const start = parseDateValue(task.startedAt)
            || parseDateValue(task.updatedAt)
            || new Date((task.lastSeenAt || Date.now()) - 60 * 1000);

          const liveEnd = clockNow > start ? clockNow : new Date(start.getTime() + 1000);
          const taskNameKey = normalizeLookupKey(task.taskName || task.scheduleName);
          const matchedSchedule = taskNameKey
            ? findByLookupKey<ScheduleDetail>(scheduleByTaskName, taskNameKey)
            : undefined;
          const matchedScope = taskNameKey
            ? findByLookupKey<RealtimeTaskScope>(realtimeTaskScopeByName, taskNameKey)
            : undefined;
          let averageDurationMins = averageDurationByTaskName.get(taskNameKey);
          if (!averageDurationMins && taskNameKey) {
            const fuzzyMatch = [...averageDurationByTaskName.entries()].find(([name]) =>
              name.includes(taskNameKey) || taskNameKey.includes(name),
            );
            averageDurationMins = fuzzyMatch?.[1];
          }
          const estimatedEndDate = averageDurationMins
            ? new Date(start.getTime() + averageDurationMins * 60000)
            : undefined;
          const taskName = matchedSchedule?.scheduleName || task.taskName || task.scheduleName || '实时运行任务';
          const scheduleUuid = matchedSchedule?.scheduleUuid || task.scheduleUuid || undefined;
          const taskGroupKey = scheduleUuid || `realtime-${taskNameKey || task.taskUuid}`;
          const groupNames = matchedScope?.groupNames || [];
          const executionScopeType: ExtendedScheduleTask['executionScopeType'] = groupNames.length > 0
            ? (matchedScope?.executionScopeType === 'mixed' ? 'mixed' : 'group')
            : 'realtime';
          const executionScopeLabel = groupNames.length > 0
            ? `正在 ${row.accountName} 执行；来自机器人组 ${formatNamesForLabel(groupNames, '未返回分组')}`
            : `正在 ${row.accountName} 执行`;

          return {
            id: `live-${row.accountKey}-${task.taskUuid}`,
            name: taskName,
            startDate: start,
            endDate: liveEnd,
            status: 'running',
            robotName: task.robotName || '实时运行任务',
            robotNames: uniqueStrings([task.robotName]),
            clientName: row.accountName,
            clientNames: [row.accountName],
            actualClientNames: [row.accountName],
            groupNames,
            executionScopeType,
            executionScopeLabel,
            taskGroupKey,
            isHistorical: false,
            isRealtime: true,
            estimatedEndDate,
            scheduleUuid,
            cronExpr: null,
          } satisfies ExtendedScheduleTask;
        })
        .filter((task): task is ExtendedScheduleTask => task !== null),
    );
  }, [averageDurationByTaskName, clockNow, realtimeQueueRows, realtimeTaskScopeByName, scheduleByTaskName]);

  const timelineTasks = useMemo(
    () => [...tasks, ...realtimeRunningTimelineTasks],
    [realtimeRunningTimelineTasks, tasks],
  );

  const overviewDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [currentDate]);

  const overviewRows = useMemo<OverviewScopeRow[]>(() => {
    const weekStart = overviewDays[0];
    const weekEnd = addDays(weekStart, 7);
    weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1);
    const rows = new Map<string, OverviewScopeRow>();

    const ensureRow = (name: string, isGroup: boolean) => {
      const id = `${isGroup ? 'group' : 'account'}:${normalizeLookupKey(name)}`;
      if (!rows.has(id)) {
        rows.set(id, {
          id,
          name,
          isGroup,
          total: 0,
          running: 0,
          queued: 0,
          completed: 0,
          cells: overviewDays.map((date) => ({
            date,
            total: 0,
            running: 0,
            queued: 0,
            completed: 0,
          })),
        });
      }

      return rows.get(id)!;
    };

    timelineTasks.forEach((task) => {
      if (!taskOverlapsRange(task, weekStart, weekEnd)) return;

      getTaskOverviewScopes(task).forEach((scope) => {
        const row = ensureRow(scope.name, scope.isGroup);
        row.total += 1;
        if (task.status === 'running') row.running += 1;
        if (task.status === 'pending') row.queued += 1;
        if (task.status === 'completed') row.completed += 1;

        row.cells.forEach((cell) => {
          const dayStart = new Date(cell.date);
          const dayEnd = addDays(dayStart, 1);
          dayEnd.setMilliseconds(dayEnd.getMilliseconds() - 1);
          if (!taskOverlapsRange(task, dayStart, dayEnd)) return;

          cell.total += 1;
          if (task.status === 'running') cell.running += 1;
          if (task.status === 'pending') cell.queued += 1;
          if (task.status === 'completed') cell.completed += 1;
        });
      });
    });

    return [...rows.values()].sort((left, right) => {
      if (right.running !== left.running) return right.running - left.running;
      if (right.queued !== left.queued) return right.queued - left.queued;
      if (right.total !== left.total) return right.total - left.total;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
  }, [overviewDays, timelineTasks]);

  const maxOverviewCellCount = useMemo(
    () => Math.max(1, ...overviewRows.flatMap((row) => row.cells.map((cell) => cell.total))),
    [overviewRows],
  );

  const openGanttForScope = (scopeName: string, date?: Date) => {
    setSearchTerm(scopeName);
    setGroupBy('account');
    if (date) {
      setCurrentDate(date);
      setViewMode('Day');
    }
    setDashboardPage('gantt');
  };

  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return timelineTasks;
    const keyword = searchTerm.trim().toLowerCase();

    if (groupBy === 'account') {
      return timelineTasks.filter((task) =>
        task.clientNames?.some((name) => matchesAccountKeyword(name, keyword))
        || matchesAccountKeyword(task.clientName, keyword)
        || task.groupNames?.some((name) => matchesAccountKeyword(name, keyword))
        || task.executionScopeLabel?.toLowerCase().includes(keyword)
        || task.name.toLowerCase().includes(keyword),
      );
    }

    return timelineTasks.filter((task) =>
      task.name.toLowerCase().includes(keyword)
      || task.id.toLowerCase().includes(keyword)
      || task.robotNames?.some((name) => name.toLowerCase().includes(keyword))
      || task.clientNames?.some((name) => name.toLowerCase().includes(keyword))
      || task.groupNames?.some((name) => name.toLowerCase().includes(keyword))
      || task.executionScopeLabel?.toLowerCase().includes(keyword),
    );
  }, [groupBy, searchTerm, timelineTasks]);

  const realtimeQueueStatusScopeRows = useMemo(() => {
    const keyword = queueSearchTerm.trim().toLowerCase();

    return realtimeQueueRows.filter((row) => {
      const hasRunning = row.runningTasks.length > 0;
      const hasQueued = row.queuedTasks.length > 0;

      if (queueStatusFilter === 'running' && !hasRunning) return false;
      if (queueStatusFilter === 'queued' && !hasQueued) return false;

      if (!keyword) return true;

      const taskMatchesKeyword = (task: RealtimeQueueTask) => {
        const scope = findByLookupKey<RealtimeTaskScope>(realtimeTaskScopeByName, task.taskName || task.scheduleName);
        return task.taskName.toLowerCase().includes(keyword)
          || scope?.groupNames.some((name) => matchesAccountKeyword(name, keyword))
          || scope?.executionScopeLabel.toLowerCase().includes(keyword);
      };

      return row.accountName.toLowerCase().includes(keyword)
        || row.machineName?.toLowerCase().includes(keyword)
        || row.clientIp?.toLowerCase().includes(keyword)
        || row.runningTasks.some(taskMatchesKeyword)
        || row.queuedTasks.some(taskMatchesKeyword);
    });
  }, [queueSearchTerm, queueStatusFilter, realtimeQueueRows, realtimeTaskScopeByName]);

  const realtimeRobotStatusSummary = useMemo(() => {
    const counts: Record<RobotStatusFilter, number> = {
      all: realtimeQueueStatusScopeRows.length,
      connected: 0,
      idle: 0,
      allocated: 0,
      running: 0,
      offline: 0,
      unknown: 0,
    };

    realtimeQueueStatusScopeRows.forEach((row) => {
      const status = String(row.robotStatus || 'unknown').toLowerCase() as RobotStatusFilter;
      if (status in counts) {
        counts[status] += 1;
      } else {
        counts.unknown += 1;
      }
    });

    return counts;
  }, [realtimeQueueStatusScopeRows]);

  const filteredRealtimeQueueRows = useMemo(() => {
    if (robotStatusFilter === 'all') return realtimeQueueStatusScopeRows;

    return realtimeQueueStatusScopeRows.filter((row) =>
      (row.robotStatus || 'unknown').toLowerCase() === robotStatusFilter,
    );
  }, [realtimeQueueStatusScopeRows, robotStatusFilter]);

  useEffect(() => {
    if (
      robotStatusFilter !== 'all'
      && realtimeRobotStatusSummary[robotStatusFilter] === 0
      && filteredRealtimeQueueRows.length === 0
    ) {
      setRobotStatusFilter('all');
    }
  }, [filteredRealtimeQueueRows.length, realtimeRobotStatusSummary, robotStatusFilter]);

  const realtimeQueueStats = useMemo(() => {
    return realtimeQueueRows.reduce(
      (summary, row) => ({
        accounts: summary.accounts + 1,
        running: summary.running + row.runningTasks.length,
        queued: summary.queued + row.queuedTasks.length,
      }),
      { accounts: 0, running: 0, queued: 0 },
    );
  }, [realtimeQueueRows]);

  const realtimeOverviewStats = useMemo(() => ({
    totalRobots: robotClients.length,
    robotRunning: robotStatusSummary.running,
    robotIdle: robotStatusSummary.idle,
    robotOffline: robotStatusSummary.offline,
    runningJobs: realtimeQueueStats.running,
    queuedJobs: realtimeQueueStats.queued,
    activeAccounts: realtimeQueueRows.filter((row) => row.runningTasks.length > 0 || row.queuedTasks.length > 0).length,
  }), [realtimeQueueRows, realtimeQueueStats.queued, realtimeQueueStats.running, robotClients.length, robotStatusSummary]);

  const robotStatusFilters: Array<{ value: RobotStatusFilter; label: string; count?: number }> = [
    { value: 'all', label: '全部', count: realtimeRobotStatusSummary.all },
    { value: 'running', label: '机器人运行中', count: realtimeRobotStatusSummary.running },
    { value: 'idle', label: '空闲', count: realtimeRobotStatusSummary.idle },
    { value: 'allocated', label: '已分配', count: realtimeRobotStatusSummary.allocated },
    { value: 'offline', label: '离线', count: realtimeRobotStatusSummary.offline },
    { value: 'connected', label: '已连接', count: realtimeRobotStatusSummary.connected },
    { value: 'unknown', label: '未知', count: realtimeRobotStatusSummary.unknown },
  ];

  const realtimeQueuePanel = (
    <Card className="w-full min-w-0 overflow-visible border-gray-200 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
      <CardHeader className="border-b px-4 py-3 dark:border-[#30363d]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <CardTitle className="text-base">实时任务看板</CardTitle>
            <span className="text-xs text-gray-500 dark:text-[#8b949e]">
              {filteredRealtimeQueueRows.length} 个账号符合当前筛选
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[11px]">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
              执行 {realtimeQueueStats.running}
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
              排队 {realtimeQueueStats.queued}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="space-y-2 border-b border-gray-100 bg-white p-3 dark:border-[#30363d] dark:bg-[#161b22]">
          <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_360px]">
            <Input
              placeholder="筛选账号、机器名或任务..."
              value={queueSearchTerm}
              onChange={(event) => setQueueSearchTerm(event.target.value)}
              className="h-8"
            />

            <Tabs value={queueStatusFilter} onValueChange={(value) => setQueueStatusFilter(value as QueueStatusFilter)}>
              <TabsList className="grid h-8 w-full grid-cols-3">
                <TabsTrigger value="all" className="h-7 text-xs">全部</TabsTrigger>
                <TabsTrigger value="running" className="h-7 text-xs">执行中</TabsTrigger>
                <TabsTrigger value="queued" className="h-7 text-xs">排队中</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap gap-1.5 pr-1">
            {robotStatusFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={item.value !== 'all' && item.count === 0}
                onClick={() => setRobotStatusFilter(item.value)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition',
                  robotStatusFilter === item.value
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-[#58a6ff] dark:bg-[#1f6feb26] dark:text-[#79c0ff]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#8b949e] dark:hover:border-[#58a6ff] dark:hover:text-[#c9d1d9]',
                  item.value !== 'all' && item.count === 0 && 'cursor-not-allowed opacity-45 hover:border-gray-200 hover:bg-white dark:hover:border-[#30363d] dark:hover:text-[#8b949e]',
                )}
              >
                {item.label}
                {typeof item.count === 'number' && <span className="ml-1 opacity-70">{item.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {filteredRealtimeQueueRows.length > 0 ? (
          <div className="bg-gray-50/70 p-3 dark:bg-[#0d1117]">
            <div className="grid gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredRealtimeQueueRows.map((row) => {
                const currentTask = row.runningTasks[0];
                const scopedTasks = [...row.runningTasks, ...row.queuedTasks];
                const rowScopeNames = uniqueStrings(
                  scopedTasks.flatMap((task) => getRealtimeTaskScope(task)?.groupNames || []),
                );
                const getQueueTaskIdentity = (task: RealtimeQueueTask) => {
                  const scopeNames = getRealtimeTaskScope(task)?.groupNames || [];
                  return `${normalizeLookupKey(task.taskName)}|${scopeNames.join('|')}`;
                };
                const visibleQueuedTasks = row.queuedTasks.filter((task, index, list) =>
                  list.findIndex((item) => getQueueTaskIdentity(item) === getQueueTaskIdentity(task)) === index,
                );
                const duplicateQueuedCount = row.queuedTasks.length - visibleQueuedTasks.length;

                return (
                  <div
                    key={row.accountKey}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-sm font-semibold text-gray-950 dark:text-slate-50">{row.accountName}</div>
                          <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            row.robotStatus === 'running' && 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
                            row.robotStatus === 'idle' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
                            row.robotStatus === 'offline' && 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
                            row.robotStatus === 'allocated' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
                            !row.robotStatus && 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
                          )}>
                            {row.robotStatusLabel}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                          {row.machineName || '未返回机器名'}
                        </div>
                        {rowScopeNames.length > 0 && (
                          <div className="mt-1 truncate text-[11px] font-medium text-purple-700 dark:text-purple-200">
                            机器人组：{formatNamesForLabel(rowScopeNames, '未返回分组')}
                          </div>
                        )}
                      </div>

                      <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-md border border-gray-100 text-center text-[11px] dark:border-[#30363d]">
                        <div className="min-w-12 bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                          <div className="font-semibold">{row.runningTasks.length}</div>
                          <div>执行</div>
                        </div>
                        <div className="min-w-12 bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                          <div className="font-semibold">{row.queuedTasks.length}</div>
                          <div>排队</div>
                        </div>
                      </div>
                    </div>

                    {currentTask ? (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                          <div className="text-gray-500 dark:text-slate-400">当前</div>
                          <div className="break-words font-medium text-gray-950 dark:text-slate-50">
                            {currentTask.taskName}
                          </div>
                          {currentTask.startedAt && (
                            <>
                              <div className="text-gray-500 dark:text-slate-400">开始</div>
                              <div className="text-gray-500 dark:text-slate-400">
                                {format(parseDateValue(currentTask.startedAt) || new Date(), 'MM-dd HH:mm:ss')}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : row.robotStatus === 'running' ? (
                      <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                        机器人运行中，但队列接口暂未返回具体任务。
                      </div>
                    ) : null}

                    {visibleQueuedTasks.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {visibleQueuedTasks.slice(0, 2).map((task) => (
                          <div key={task.taskUuid} className="rounded-md border border-gray-100 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-[#0d1117]">
                            <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1">
                              <div className="text-amber-700 dark:text-amber-200">排队</div>
                              <div className="break-words font-medium text-gray-900 dark:text-slate-50">{task.taskName}</div>
                              {task.updatedAt && (
                                <>
                                  <div className="text-gray-500 dark:text-slate-400">时间</div>
                                  <div className="text-gray-500 dark:text-slate-400">
                                    {format(parseDateValue(task.updatedAt) || new Date(), 'MM-dd HH:mm:ss')}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {(visibleQueuedTasks.length > 2 || duplicateQueuedCount > 0) && (
                          <div className="text-[11px] text-gray-500 dark:text-slate-400">
                            {visibleQueuedTasks.length > 2 ? `还有 ${visibleQueuedTasks.length - 2} 个排队任务` : ''}
                            {visibleQueuedTasks.length > 2 && duplicateQueuedCount > 0 ? '，' : ''}
                            {duplicateQueuedCount > 0 ? `已合并 ${duplicateQueuedCount} 条重复队列记录` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center px-4 py-10 text-center text-sm text-gray-500 dark:text-slate-400">
            当前筛选条件下没有运行中或排队任务
          </div>
        )}
      </CardContent>
    </Card>
  );

  const overviewPanel = (
    <Card className="overflow-hidden border-gray-200 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
      <CardHeader className="border-b p-4 dark:border-[#30363d]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">全局总览</CardTitle>
            <CardDescription className="mt-1">
              按机器人组或账号看一周负载，蓝/黄/橙/红表示从低到高的任务密度。
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-white p-1 shadow-sm dark:border-[#30363d] dark:bg-[#0d1117]">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate((value) => subWeeks(value, 1))} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className="h-8 px-3 text-sm font-medium">
                今天
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate((value) => addWeeks(value, 1))} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-36 text-right text-sm font-semibold text-gray-700 dark:text-[#c9d1d9]">
              {format(overviewDays[0], 'MM-dd', { locale: zhCN })} - {format(overviewDays[6], 'MM-dd', { locale: zhCN })}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid gap-3 border-b p-4 dark:border-[#30363d] md:grid-cols-4">
          <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <div className="text-xs text-gray-500 dark:text-slate-400">范围数量</div>
            <div className="mt-1 text-2xl font-semibold">{overviewRows.length}</div>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <div className="text-xs">执行中</div>
            <div className="mt-1 text-2xl font-semibold">{overviewRows.reduce((sum, row) => sum + row.running, 0)}</div>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="text-xs">计划/排队</div>
            <div className="mt-1 text-2xl font-semibold">{overviewRows.reduce((sum, row) => sum + row.queued, 0)}</div>
          </div>
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="text-xs">历史完成</div>
            <div className="mt-1 text-2xl font-semibold">{overviewRows.reduce((sum, row) => sum + row.completed, 0)}</div>
          </div>
        </div>

        {overviewRows.length > 0 ? (
          <div className="overflow-x-auto overflow-y-visible">
            <div className="min-w-[1020px]">
              <div
                className="sticky top-0 z-10 grid border-b bg-white text-xs font-medium text-gray-500 dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#8b949e]"
                style={{ gridTemplateColumns: '280px repeat(7, minmax(104px, 1fr))' }}
              >
                <div className="border-r px-4 py-3 dark:border-[#30363d]">范围</div>
                {overviewDays.map((day) => (
                  <div key={day.toISOString()} className="border-r px-3 py-3 text-center last:border-r-0 dark:border-[#30363d]">
                    {format(day, 'M月d日 EEEE', { locale: zhCN })}
                  </div>
                ))}
              </div>

              {overviewRows.map((row) => (
                <div
                  key={row.id}
                  className="grid border-b last:border-b-0 dark:border-[#30363d]"
                  style={{ gridTemplateColumns: '280px repeat(7, minmax(104px, 1fr))' }}
                >
                  <button
                    type="button"
                    onClick={() => openGanttForScope(row.name)}
                    className="flex min-h-16 min-w-0 flex-col items-start justify-center border-r px-4 py-3 text-left hover:bg-gray-50 dark:border-[#30363d] dark:hover:bg-[#21262d]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {row.isGroup ? <Users className="h-4 w-4 shrink-0 text-purple-600" /> : <Bot className="h-4 w-4 shrink-0 text-emerald-600" />}
                      <span className="truncate font-medium text-gray-950 dark:text-[#f0f6fc]">{row.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-[#8b949e]">
                      共 {row.total} 条，执行 {row.running}，计划/排队 {row.queued}
                    </div>
                  </button>

                  {row.cells.map((cell) => {
                    const ratio = Math.min(1, cell.total / maxOverviewCellCount);
                    const loadLevel = cell.total >= 12 || ratio >= 0.8
                      ? 'critical'
                      : cell.total >= 8 || ratio >= 0.55
                        ? 'high'
                        : cell.total >= 4 || ratio >= 0.3
                          ? 'medium'
                          : cell.total > 0
                            ? 'low'
                            : 'empty';
                    const cellClass = loadLevel === 'empty'
                      ? 'bg-white text-gray-300 dark:bg-[#161b22] dark:text-slate-600'
                      : loadLevel === 'critical'
                        ? 'border-l-4 border-l-red-600 bg-red-200 text-red-950 hover:bg-red-300 dark:border-l-red-400 dark:bg-red-950/70 dark:text-red-50 dark:hover:bg-red-950'
                        : loadLevel === 'high'
                          ? 'border-l-4 border-l-orange-500 bg-orange-200 text-orange-950 hover:bg-orange-300 dark:border-l-orange-300 dark:bg-orange-950/65 dark:text-orange-50 dark:hover:bg-orange-950'
                          : loadLevel === 'medium'
                            ? 'border-l-4 border-l-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-l-amber-300 dark:bg-amber-950/55 dark:text-amber-50 dark:hover:bg-amber-950/75'
                            : 'border-l-4 border-l-sky-400 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-l-sky-300 dark:bg-sky-950/45 dark:text-sky-50 dark:hover:bg-sky-950/65';
                    const meterClass = loadLevel === 'critical'
                      ? 'bg-red-700 dark:bg-red-300'
                      : loadLevel === 'high'
                        ? 'bg-orange-600 dark:bg-orange-300'
                        : loadLevel === 'medium'
                          ? 'bg-amber-500 dark:bg-amber-300'
                          : 'bg-sky-500 dark:bg-sky-300';

                    return (
                      <button
                        key={`${row.id}-${cell.date.toISOString()}`}
                        type="button"
                        disabled={cell.total === 0}
                        onClick={() => openGanttForScope(row.name, cell.date)}
                        className={cn(
                          'relative min-h-16 overflow-hidden border-r px-3 py-2 pb-4 text-left text-xs transition last:border-r-0 disabled:cursor-default dark:border-[#30363d]',
                          cellClass,
                        )}
                      >
                        {cell.total > 0 ? (
                          <>
                            <div className={cn('text-xl font-bold leading-none', loadLevel === 'critical' && 'text-2xl')}>
                              {cell.total}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-medium">
                              {cell.running > 0 && <span>执行 {cell.running}</span>}
                              {cell.queued > 0 && <span>计划 {cell.queued}</span>}
                              {cell.completed > 0 && <span>完成 {cell.completed}</span>}
                            </div>
                            <div className="absolute bottom-1.5 left-3 right-3 h-1 rounded-full bg-white/60 dark:bg-black/25">
                              <div
                                className={cn('h-full rounded-full', meterClass)}
                                style={{ width: `${Math.max(18, Math.round(ratio * 100))}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span>0</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-[#8b949e]">
            当前周没有可汇总的任务记录
          </div>
        )}
      </CardContent>
    </Card>
  );

  const ganttPanel = (
    <Card className="w-full min-w-0 overflow-visible border-gray-200 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
      <CardHeader className="border-b pb-4 dark:border-[#30363d]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarIcon className="h-5 w-5 shrink-0 text-gray-500 dark:text-[#8b949e]" />
              <CardTitle className="whitespace-nowrap text-lg">计划甘特图</CardTitle>
            </div>
            <span className="text-right text-sm font-semibold text-gray-700 dark:text-[#c9d1d9]">
              {currentPeriodLabel}
            </span>
          </div>

          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-1 rounded-md border bg-white p-1 shadow-sm dark:border-[#30363d] dark:bg-[#0d1117]">
                <Button variant="ghost" size="icon" onClick={handlePrevPeriod} className="h-8 w-8 dark:text-[#c9d1d9] dark:hover:bg-[#21262d]">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className="h-8 px-3 text-sm font-medium dark:text-[#f0f6fc] dark:hover:bg-[#21262d]">
                  今天
                </Button>
                <Button variant="ghost" size="icon" onClick={handleNextPeriod} className="h-8 w-8 dark:text-[#c9d1d9] dark:hover:bg-[#21262d]">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_minmax(220px,1fr)_300px] lg:flex-1">
              <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as TimelineGroupBy)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="task">按任务</TabsTrigger>
                  <TabsTrigger value="account">按账号/分组</TabsTrigger>
                </TabsList>
              </Tabs>

              <Input
                placeholder="搜索任务、应用或机器人..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full"
              />

              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="Day">日</TabsTrigger>
                  <TabsTrigger value="Week">周</TabsTrigger>
                  <TabsTrigger value="Month">月</TabsTrigger>
                  <TabsTrigger value="Year">年</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p>正在按分页拉取任务、执行记录和运行结果，请稍候...</p>
          </div>
        ) : filteredTasks.length > 0 ? (
          <div className="p-3">
            <GanttChart
              tasks={filteredTasks}
              viewMode={viewMode}
              currentDate={currentDate}
              currentTime={clockNow}
              groupBy={groupBy}
              robotClients={robotClients}
              robotGroups={robotGroups}
              searchTerm={searchTerm}
            />
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">
            {searchTerm ? (
              <div className="py-12">
                <Bot className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="text-lg font-medium text-gray-900 dark:text-[#f0f6fc]">没有找到匹配结果</p>
                <p className="mt-1">试试更换任务名、机器人名或账号名关键字。</p>
                <Button variant="link" onClick={() => setSearchTerm('')} className="mt-2">
                  清空搜索
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-4">当前没有生成可展示的计划任务。</p>
                {scheduleReadSummary.total > 0 && (
                  <div className="mx-auto max-w-xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    已读取到 {scheduleReadSummary.total} 个任务，其中 {scheduleReadSummary.disabled} 个已停用，{scheduleReadSummary.unschedulable} 个为手动任务或无下次执行时间，无法生成至甘特图。
                    {scheduleReadSummary.schedulable > 0 && (
                      <span> 另有 {scheduleReadSummary.schedulable} 个任务具备排程规则，但当前推算范围内没有可展示记录。</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">影刀任务计划看板</CardTitle>
            <CardDescription>
              输入影刀 Access Key，查看常规定时任务计划和实时任务状态。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessKeyId">Access Key ID</Label>
                <Input
                  id="accessKeyId"
                  placeholder="例如：MuGq4mZeVS9gQkTf@platform"
                  value={accessKeyId}
                  onChange={(event) => setAccessKeyId(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessKeySecret">Access Key Secret</Label>
                <Input
                  id="accessKeySecret"
                  type="password"
                  placeholder="请输入 Access Key Secret"
                  value={accessKeySecret}
                  onChange={(event) => setAccessKeySecret(event.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md border border-red-100">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在登录并加载数据...
                  </>
                ) : (
                  '连接并生成计划看板'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(themeMode === 'dark' && 'dark')}>
      <div className="min-h-screen bg-gray-50 p-2 text-gray-900 md:p-3 dark:bg-[#0d1117] dark:text-[#c9d1d9]">
      <div className="mx-auto max-w-[1920px] space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 md:text-2xl dark:text-[#f0f6fc]">影刀任务计划看板</h1>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-[#8b949e]">常规定时任务、实时执行与排队状态</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastUpdatedAt && (
              <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-right text-[11px] text-gray-500 dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#8b949e]">
                <div>{Math.round(AUTO_REFRESH_MS / 1000)} 秒同步</div>
                <div>更新 {format(lastUpdatedAt, 'HH:mm:ss')}</div>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setThemeMode((value) => (value === 'dark' ? 'light' : 'dark'))}
              title={themeMode === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
              className="h-8 w-9 px-0"
            >
              {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="outline" onClick={() => refreshDashboard(token)} disabled={loading} className="h-8 px-3">
              <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
              刷新
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setToken('');
                setSchedules([]);
                setTasks([]);
                setRobotClients([]);
                setRobotGroups([]);
                setRealtimeQueueRows([]);
                setScheduleReadSummary({ total: 0, disabled: 0, unschedulable: 0, schedulable: 0 });
              }}
              className="h-8 px-2"
            >
              退出登录
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <Tabs value={dashboardPage} onValueChange={(value) => setDashboardPage(value as DashboardPage)} className="w-full xl:w-[420px] xl:shrink-0">
              <TabsList className="grid h-9 w-full grid-cols-3 rounded-md bg-gray-100 p-0.5 dark:bg-[#0d1117]">
                <TabsTrigger value="overview" className="h-8 text-xs">总览</TabsTrigger>
                <TabsTrigger value="realtime" className="h-8 text-xs">实时任务</TabsTrigger>
                <TabsTrigger value="gantt" className="h-8 text-xs">计划甘特图</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {[
                { label: '机器人', value: realtimeOverviewStats.totalRobots, className: 'bg-white dark:bg-[#161b22]' },
                { label: '运行', value: realtimeOverviewStats.robotRunning, className: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' },
                { label: '空闲', value: realtimeOverviewStats.robotIdle, className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' },
                { label: '离线', value: realtimeOverviewStats.robotOffline, className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
                { label: '执行任务', value: realtimeOverviewStats.runningJobs, className: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-200' },
                { label: '排队任务', value: realtimeOverviewStats.queuedJobs, className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' },
                { label: '有任务账号', value: `${realtimeOverviewStats.activeAccounts}/${realtimeQueueStats.accounts}`, className: 'bg-violet-50 text-violet-800 dark:bg-violet-950/35 dark:text-violet-200' },
              ].map((item) => (
                <div
                  key={item.label}
                  className={cn('min-h-12 rounded-md border border-gray-100 px-3 py-2 dark:border-[#30363d]', item.className)}
                >
                  <div className="text-[11px] opacity-70">{item.label}</div>
                  <div className="mt-0.5 text-lg font-semibold leading-none">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-500 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}

        {loadingSummary && (
          <Card className="shadow-sm border-gray-200 dark:border-[#30363d] dark:bg-[#161b22]">
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-[#f0f6fc]">{loadingProgress.message}</p>
                    <p className="text-xs text-gray-500 dark:text-[#8b949e]">
                      {loadingProgress.discoveredSchedules > 0
                        ? `已处理 ${loadingProgress.processedSchedules} / ${loadingProgress.discoveredSchedules} 个任务，已采样 ${loadingProgress.completedSamples} 条成功历史`
                        : '正在初始化加载流程'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#f0f6fc]">{loadingSummary.percent}%</p>
                    <p className="text-xs text-gray-500 dark:text-[#8b949e]">{loadingSummary.etaText}</p>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-gray-900 transition-all duration-500"
                    style={{ width: `${loadingSummary.percent}%` }}
                  />
                </div>
                {loadingProgress.averageScheduleMs > 0 && (
                  <p className="text-xs text-gray-500 dark:text-[#8b949e]">
                    当前平均每个任务耗时约 {Math.max(1, Math.round(loadingProgress.averageScheduleMs / 1000))} 秒，系统会根据实时进度自动修正预估。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="min-h-0">
          {dashboardPage === 'overview' && overviewPanel}
          {dashboardPage === 'realtime' && realtimeQueuePanel}
          {dashboardPage === 'gantt' && ganttPanel}
        </div>
      </div>
    </div>
    </div>
  );
}
