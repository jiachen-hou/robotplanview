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
import { Loader2, Calendar as CalendarIcon, KeyRound, RefreshCw, Bot, ChevronLeft, ChevronRight } from 'lucide-react';

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

export interface ExtendedScheduleTask extends ScheduleTask {
  robotName?: string;
  robotNames?: string[];
  clientName?: string;
  clientNames?: string[];
  isHistorical?: boolean;
  scheduleUuid?: string;
  cronExpr?: string | null;
}

const SCHEDULE_PAGE_SIZE = 200;
const TASK_PAGE_SIZE = 100;
const RECENT_HISTORY_DAYS = 7;
const FUTURE_DAYS = 30;
const SCHEDULE_CONCURRENCY = 8;
const MAX_SUCCESSFUL_HISTORY_SAMPLES = 10;
const AUTO_REFRESH_MS = 5000;

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

function isFinishedStatus(status?: string, statusName?: string): boolean {
  return ['finish', 'finished', 'success'].includes((status || '').toLowerCase())
    || ['瀹屾垚', '鎴愬姛'].includes(statusName || '');
}

function isRunningStatus(status?: string, statusName?: string): boolean {
  return ['running', 'process'].includes((status || '').toLowerCase())
    || ['运行中', '执行中'].includes(statusName || '');
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
  return end.getTime() - start.getTime();
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
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>(INITIAL_LOADING_PROGRESS);
  const [activeSchedules, setActiveSchedules] = useState<LoadingActivity[]>([]);
  const [recentlyCompletedSchedules, setRecentlyCompletedSchedules] = useState<CompletedActivity[]>([]);
  const [skippedSchedules, setSkippedSchedules] = useState<SkippedScheduleInfo[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('Week');
  const [groupBy, setGroupBy] = useState<'task' | 'robot'>('task');
  const [currentDate, setCurrentDate] = useState(new Date());
  const loadingRef = useRef(false);
  const schedulesRef = useRef<ScheduleDetail[]>([]);

  useEffect(() => {
    const savedId = localStorage.getItem('yingdao_ak_id');
    const savedSecret = localStorage.getItem('yingdao_ak_secret');
    if (savedId) setAccessKeyId(savedId);
    if (savedSecret) setAccessKeySecret(savedSecret);
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

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

    throw new Error(`璇锋眰 ${url} 澶辫触`);
  };

  const fetchRobotClients = async (accessToken: string) => {
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
  };

  const fetchRobotGroups = async (accessToken: string) => {
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
  };

  const fetchAllSchedules = async (accessToken: string): Promise<ScheduleItem[]> => {
    const allSchedules: ScheduleItem[] = [];
    let page = 1;

    while (true) {
      const response: any = await postWithRetry('/api/yingdao/schedule/list', {
        token: accessToken,
        payload: { page, size: SCHEDULE_PAGE_SIZE },
      });

      if (page === 1) {
        setRawResponse(response);
      }

      const list = parseApiList<ScheduleItem>(response);
      if (!list.length) {
        if (page === 1) {
          const fallbackResponse: any = await postWithRetry('/api/yingdao/schedule/list', {
            token: accessToken,
            payload: {},
          });
          const fallbackList = parseApiList<ScheduleItem>(fallbackResponse);
          if (fallbackList.length) {
            setRawResponse(fallbackResponse);
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
      const taskUuid = String(record.taskUuid || record.uuid || '');
      const start = getTaskRecordStart(record);
      const end = getTaskRecordEnd(record);

      if (!start || !end || end <= start) return;
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
      const clientNames = uniqueStrings([
        ...(item.robotClientList?.flatMap((client) => [client.robotClientName, client.windowsUserName]) || []),
        ...(item.robotClientGroupList?.flatMap((group) => [group.robotClientGroupName, group.name]) || []),
        ...(item.robotGroupList?.flatMap((group) => [group.robotGroupName, group.name]) || []),
        item.robotClientGroup?.name,
        ...(item.derivedClientNames || []),
        (item as any).clientName,
        (item as any).creatorName,
      ]);

      const robotName = robotNames[0] || '未知应用';
      const clientName = clientNames[0] || 'Unknown client';

      item.historicalRuns?.forEach((run) => {
        const status: ExtendedScheduleTask['status'] = isFinishedStatus(run.status)
          ? 'completed'
          : isRunningStatus(run.status)
            ? 'running'
            : 'failed';

        nextTasks.push({
          id: `hist-${item.scheduleUuid}-${run.id}`,
          name: item.scheduleName || 'Unnamed schedule',
          startDate: run.start,
          endDate: run.end,
          status,
          robotName,
          robotNames: uniqueStrings([...robotNames, ...run.robotNames]),
          clientName,
          clientNames: uniqueStrings([...clientNames, ...run.clientNames]),
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
        console.warn(`瑙ｆ瀽 cron 澶辫触: ${item.scheduleName}`, err);
      }
    });

    nextTasks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setTasks(nextTasks);
    setSkippedSchedules(skipped);
  };

  const syncDashboardSnapshot = async (accessToken: string) => {
    const [allSchedules] = await Promise.all([
      fetchAllSchedules(accessToken),
      fetchRobotClients(accessToken),
      fetchRobotGroups(accessToken),
    ]);

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
    setLastUpdatedAt(new Date());
  };

  const refreshDashboard = async (accessToken: string, mode: 'full' | 'incremental' = 'full') => {
    if (mode === 'incremental') {
      await syncDashboardSnapshot(accessToken);
      return;
    }

    setLoading(true);
    setError('');
    setActiveSchedules([]);
    setRecentlyCompletedSchedules([]);
    setLoadingProgress({
      ...INITIAL_LOADING_PROGRESS,
      phase: 'catalog',
      message: '正在读取任务目录和机器人信息...',
    });

    try {
      const [allSchedules] = await Promise.all([
        fetchAllSchedules(accessToken),
        fetchRobotClients(accessToken),
        fetchRobotGroups(accessToken),
      ]);

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
      setError(err.response?.data?.message || err.message || '璁よ瘉澶辫触');
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return tasks;
    const keyword = searchTerm.trim().toLowerCase();

    if (groupBy === 'robot') {
      return tasks.filter((task) =>
        matchesAccountKeyword(task.clientName, keyword),
      );
    }

    return tasks.filter((task) =>
      task.name.toLowerCase().includes(keyword)
      || task.id.toLowerCase().includes(keyword)
      || task.robotNames?.some((name) => name.toLowerCase().includes(keyword))
      || task.clientNames?.some((name) => name.toLowerCase().includes(keyword)),
    );
  }, [groupBy, searchTerm, tasks]);

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
          ? 'nextTime 宸茬粡杩囨湡'
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

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">未来计划看板</CardTitle>
            <CardDescription>
              输入影刀 Access Key，系统会拉取全部有规律的任务，统计历史完成时长，并推算未来 30 天的执行计划。
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">未来计划看板</h1>
            <p className="text-gray-500 mt-1">根据影刀历史运行结果，推算接下来所有有规律任务的执行计划</p>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdatedAt && (
              <div className="text-right text-xs text-gray-500">
                <div>每 5 秒自动同步</div>
                <div>上次更新 {format(lastUpdatedAt, 'HH:mm:ss')}</div>
              </div>
            )}
            <Button variant="outline" onClick={() => refreshDashboard(token)} disabled={loading}>
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
                setRawResponse(null);
              }}
            >
              退出登录            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-500 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}

        {loadingSummary && (
          <Card className="shadow-sm border-gray-200">
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{loadingProgress.message}</p>
                    <p className="text-xs text-gray-500">
                      {loadingProgress.discoveredSchedules > 0
                        ? `已处理 ${loadingProgress.processedSchedules} / ${loadingProgress.discoveredSchedules} 个任务，已采样 ${loadingProgress.completedSamples} 条成功历史`
                        : '正在初始化加载流程'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{loadingSummary.percent}%</p>
                    <p className="text-xs text-gray-500">{loadingSummary.etaText}</p>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-gray-900 transition-all duration-500"
                    style={{ width: `${loadingSummary.percent}%` }}
                  />
                </div>
                {loadingProgress.averageScheduleMs > 0 && (
                  <p className="text-xs text-gray-500">
                    当前平均每个任务耗时约 {Math.max(1, Math.round(loadingProgress.averageScheduleMs / 1000))} 秒，系统会根据实时进度自动修正预估。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {false && null}
        {false && null}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-4 border-b">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-gray-500" />
                <CardTitle className="text-lg">计划甘特图</CardTitle>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white border rounded-md p-1 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={handlePrevPeriod} className="h-8 w-8">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className="h-8 px-3 text-sm font-medium">
                      今天
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNextPeriod} className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">
                    {currentPeriodLabel}
                  </span>
                </div>

                <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as 'task' | 'robot')} className="w-full sm:w-[200px]">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="task">按任务</TabsTrigger>
                    <TabsTrigger value="robot">按账号</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Input
                  placeholder="搜索任务、应用或机器人..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full sm:w-64"
                />

                <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="w-full sm:w-[300px]">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="Day">日</TabsTrigger>
                    <TabsTrigger value="Week">周</TabsTrigger>
                    <TabsTrigger value="Month">月</TabsTrigger>
                    <TabsTrigger value="Year">年</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading && tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p>正在按分页拉取任务、执行记录和运行结果，请稍候...</p>
              </div>
            ) : filteredTasks.length > 0 ? (
              <div className="p-4">
                <GanttChart
                  tasks={filteredTasks}
                  viewMode={viewMode}
                  currentDate={currentDate}
                  groupBy={groupBy}
                  robotClients={robotClients}
                  robotGroups={robotGroups}
                  searchTerm={searchTerm}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {searchTerm ? (
                  <div className="py-12">
                    <Bot className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="text-lg font-medium text-gray-900">没有找到匹配结果</p>
                    <p className="mt-1">试试更换任务名、机器人名或账号名关键字。</p>
                    <Button variant="link" onClick={() => setSearchTerm('')} className="mt-2">
                      清空搜索
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="mb-4">当前没有生成可展示的计划任务。</p>
                    {(schedules.length > 0 || rawResponse) && (
                      <div className="text-left bg-gray-100 p-4 rounded-md overflow-auto max-h-96 text-xs font-mono">
                        <p className="font-bold mb-2">调试信息（首屏原始响应）</p>
                        <pre>{JSON.stringify(rawResponse || schedules, null, 2)}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
