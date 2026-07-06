export type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

export interface ScheduleTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface CronInterface {
  type?: string;
  minute?: number;
  hour?: number;
  dayOfWeeks?: number[];
  month?: number;
  time?: string;
  nextTime?: string;
  cronExpress?: string;
}

export interface ScheduleItem {
  scheduleUuid: string;
  scheduleName: string;
  scheduleType: string;
  enabled: boolean | string;
  cronInterface?: CronInterface | string;
  nextTime?: string;
  nextRunTime?: string;
  status?: string | number;
  robotName?: string;
  appName?: string;
  clientName?: string;
  creatorName?: string;
  ownerName?: string;
  userName?: string;
  clientGroupName?: string;
  robotGroupName?: string;
  [key: string]: unknown;
}

export interface RobotInfo {
  robotUuid?: string;
  robotName?: string;
}

export interface RobotClientInfo {
  uuid?: string;
  robotClientUuid?: string;
  robotClientName?: string;
  statusName?: string;
  windowsUserName?: string;
}

export interface RobotClientGroupInfo {
  uuid?: string;
  robotClientGroupUuid?: string;
  robotClientGroupName?: string;
  name?: string;
}

export interface RobotGroupInfo {
  uuid?: string;
  robotGroupUuid?: string;
  robotGroupName?: string;
  name?: string;
}

export interface HistoricalRun {
  id: string;
  start: Date;
  end: Date;
  status: string;
  robotNames: string[];
  clientNames: string[];
}

export interface ScheduleDetail extends ScheduleItem {
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

export interface RobotClient {
  robotClientUuid?: string;
  robotClientName?: string;
  status?: string;
  windowsUserName?: string;
  clientIp?: string;
  machineName?: string;
  clientVersion?: string;
  createTime?: string;
}

export interface RobotGroup {
  uuid: string;
  name: string;
}

export interface TaskClient {
  robotClientUuid?: string;
  robotClientName?: string;
  currentRobotUuid?: string;
  currentRobotName?: string;
  sceneInstStartTime?: string;
  clientStatus?: string;
  clientStatusName?: string;
  windowsUserName?: string;
}

export interface TaskListRecord {
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

export interface RobotJobRecord {
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

export interface RealtimeQueueTask {
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

export interface RealtimeQueueRow {
  accountKey: string;
  accountName: string;
  robotClientUuid?: string;
  robotStatus: string;
  robotStatusLabel: string;
  machineName?: string;
  clientIp?: string;
  runningTasks: RealtimeQueueTask[];
  queuedTasks: RealtimeQueueTask[];
  queueQueriedAt?: number;
  queueIsStale?: boolean;
  queueError?: string;
}

export type QueueStatusFilter = 'all' | 'running' | 'queued';
export type RobotStatusFilter = 'all' | 'running' | 'idle' | 'allocated' | 'connected' | 'offline' | 'unknown';
export type TimelineGroupBy = 'task' | 'account';
export type ThemeMode = 'light' | 'dark';
export type DashboardPage = 'overview' | 'realtime' | 'gantt';

export interface LoadingProgress {
  phase: 'idle' | 'auth' | 'catalog' | 'hydrating' | 'rendering';
  message: string;
  discoveredSchedules: number;
  processedSchedules: number;
  completedSamples: number;
  averageScheduleMs: number;
  etaSeconds: number | null;
}

export interface LoadingActivity {
  scheduleUuid: string;
  scheduleName: string;
  startedAt: number;
}

export interface CompletedActivity {
  scheduleUuid: string;
  scheduleName: string;
  durationMs: number;
  successfulSamples: number;
  finishedAt: number;
}

export interface SkippedScheduleInfo {
  scheduleUuid: string;
  scheduleName: string;
  reason: 'no_schedule_rule' | 'next_time_in_past' | 'cron_parse_failed' | 'no_future_occurrence_within_horizon';
  cronExpression?: string | null;
  nextTime?: string | null;
}

export interface ScheduleReadSummary {
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
  identityKey?: string;
}

export interface RealtimeTaskScope {
  scheduleName: string;
  scheduleUuid?: string;
  groupNames: string[];
  executionScopeType: ExtendedScheduleTask['executionScopeType'];
  executionScopeLabel: string;
}

export interface OverviewScopeCell {
  date: Date;
  total: number;
  running: number;
  queued: number;
  completed: number;
}

export interface OverviewScopeRow {
  id: string;
  name: string;
  isGroup: boolean;
  total: number;
  running: number;
  queued: number;
  completed: number;
  cells: OverviewScopeCell[];
}

export interface TaskIdentityParts {
  sourceType: 'historical' | 'future' | 'realtime' | 'queue';
  scheduleUuid?: string;
  taskUuid?: string;
  accountName?: string;
  taskName?: string;
  startTime?: string | Date | null;
  status?: string;
}
