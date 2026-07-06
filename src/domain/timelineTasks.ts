import { addDays } from 'date-fns';
import CronExpressionParser from 'cron-parser';

import type { ExtendedScheduleTask, ScheduleDetail, SkippedScheduleInfo } from '@/src/types/dashboard';
import { normalizeLookupKey, uniqueStrings } from './common';
import { buildTaskIdentity } from './taskIdentity';
import {
  describeExecutionScope,
  getCronExpression,
  getScheduleConfiguredAccountNames,
  getScheduleGroupNames,
  isFinishedStatus,
  isRunningStatus,
  parseCronInterface,
  parseDateValue,
} from './yingdao';

export interface GenerateScheduleTasksOptions {
  now?: Date;
  futureDays: number;
  maxOccurrences?: number;
}

export interface GenerateScheduleTasksResult {
  tasks: ExtendedScheduleTask[];
  skipped: SkippedScheduleInfo[];
}

export function generateScheduleTasks(
  items: ScheduleDetail[],
  options: GenerateScheduleTasksOptions,
): GenerateScheduleTasksResult {
  const nextTasks: ExtendedScheduleTask[] = [];
  const skipped: SkippedScheduleInfo[] = [];
  const now = options.now || new Date();
  const horizon = addDays(now, options.futureDays);
  const maxOccurrences = options.maxOccurrences ?? 1000;

  items.forEach((item) => {
    const cronInterface = parseCronInterface(item.cronInterface);
    const cronExpression = getCronExpression(cronInterface);
    const nextTime = cronInterface?.nextTime || item.nextTime || item.nextRunTime;

    const robotNames = uniqueStrings([
      ...(item.robotList?.map((robot) => robot.robotName) || []),
      ...(item.derivedRobotNames || []),
      item.robotName,
      item.appName,
    ]);
    const configuredAccountNames = getScheduleConfiguredAccountNames(item);
    const groupNames = getScheduleGroupNames(item);
    const observedClientNames = uniqueStrings([
      ...(item.derivedClientNames || []),
      item.clientName,
      item.creatorName,
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
      const identityKey = buildTaskIdentity({
        sourceType: 'historical',
        scheduleUuid: item.scheduleUuid,
        taskUuid: run.id,
        accountName: historicalClientNames.join('|'),
        taskName: item.scheduleName,
        startTime: run.start,
        status,
      });

      nextTasks.push({
        id: `hist-${item.scheduleUuid}-${run.id}`,
        identityKey,
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

    const pushFutureTask = (start: Date, idSuffix: string, occurrenceIndex?: number) => {
      const identityKey = buildTaskIdentity({
        sourceType: 'future',
        scheduleUuid: item.scheduleUuid,
        taskUuid: occurrenceIndex === undefined ? idSuffix : String(occurrenceIndex),
        accountName: clientNames.join('|') || groupNames.join('|'),
        taskName: item.scheduleName,
        startTime: start,
        status: 'pending',
      });

      nextTasks.push({
        id: `${item.scheduleUuid}-${idSuffix}`,
        identityKey,
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
    };

    if (!cronExpression) {
      if (nextTime) {
        const start = parseDateValue(nextTime);
        if (start && start >= now) {
          pushFutureTask(start, 'next');
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

      while (count < maxOccurrences) {
        const start = iterator.next().toDate();
        if (start > horizon) break;

        pushFutureTask(start, String(count), count);
        count += 1;
      }
      if (count === 0) {
        const fallbackStart = parseDateValue(nextTime);
        if (fallbackStart && fallbackStart >= now) {
          pushFutureTask(fallbackStart, 'next-fallback');
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
    } catch {
      skipped.push({
        scheduleUuid: item.scheduleUuid,
        scheduleName: item.scheduleName || 'Unnamed schedule',
        reason: 'cron_parse_failed',
        cronExpression,
        nextTime: nextTime || null,
      });
    }
  });

  nextTasks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return { tasks: nextTasks, skipped };
}
