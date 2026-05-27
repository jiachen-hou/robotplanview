import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { AppWindow, Bot, ChevronLeft, ChevronRight, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ExtendedScheduleTask } from '@/src/App';

export type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

export interface ScheduleTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

type TaskGroup = {
  id: string;
  name: string;
  robotName: string;
  robotNames?: string[];
  clientName: string;
  scopeLabel?: string;
  groupNames?: string[];
  isGroup?: boolean;
  isFallbackGroup?: boolean;
  executions: Array<ExtendedScheduleTask & { lane: number }>;
  totalLanes: number;
};

type TooltipState = {
  key: string;
  task: ExtendedScheduleTask;
  tasks: ExtendedScheduleTask[];
  x: number;
  y: number;
  pinned: boolean;
};

interface GanttChartProps {
  tasks: ExtendedScheduleTask[];
  viewMode: ViewMode;
  currentDate: Date;
  currentTime?: Date;
  groupBy?: 'task' | 'account';
  robotClients?: any[];
  robotGroups?: any[];
  searchTerm?: string;
}

function matchesRobotGroupKeyword(value: string | undefined, keyword: string): boolean {
  if (!value) return false;
  const normalizedValue = value.trim().toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedValue || !normalizedKeyword) return false;
  return normalizedValue.includes(normalizedKeyword) || normalizedValue.split('@')[0].includes(normalizedKeyword);
}

function normalizeGroupKey(value: string): string {
  return value.trim().toLowerCase();
}

function getRowGroupKey(name: string, isGroup: boolean): string {
  return `${isGroup ? 'group' : 'account'}_${normalizeGroupKey(name)}`;
}

function uniqueValues(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function formatCompactNames(values: Array<string | undefined | null>, emptyText: string): string {
  const names = uniqueValues(values);
  if (names.length === 0) return emptyText;
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 个`;
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'pending':
      return '待执行';
    case 'running':
      return '运行中';
    case 'completed':
    case 'finish':
      return '完成';
    case 'failed':
    case 'error':
      return '失败';
    case 'stopped':
      return '已结束';
    case 'stopping':
      return '正在停止';
    case 'cancel':
      return '已取消';
    case 'skipped':
      return '已跳过';
    case 'waiting':
      return '等待调度';
    default:
      return status || '未知';
  }
}

function getTaskTypeLabel(task: ExtendedScheduleTask): string {
  if (task.isRealtime) return '实时运行';
  if (task.isHistorical) return '历史样本';
  return '未来计划';
}

function formatDuration(startDate: Date, endDate: Date): string {
  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${Math.max(1, Math.round(diffMs / 1000))} 秒`;
}

function getTooltipPosition(x: number, y: number, width = 340, height = 300): React.CSSProperties {
  const padding = 12;
  const gap = 14;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1600;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  const safeWidth = Math.min(width, viewportWidth - padding * 2);
  const safeHeight = Math.min(height, viewportHeight - padding * 2);
  let left = x + gap;
  let top = y + gap;

  if (left + safeWidth + padding > viewportWidth) {
    left = x - safeWidth - gap;
  }

  if (top + safeHeight + padding > viewportHeight) {
    top = y - safeHeight - gap;
  }

  return {
    left: Math.min(Math.max(padding, left), viewportWidth - safeWidth - padding),
    top: Math.min(Math.max(padding, top), viewportHeight - safeHeight - padding),
  };
}

export function GanttChart({
  tasks,
  viewMode,
  currentDate,
  currentTime,
  groupBy = 'task',
  robotClients = [],
  robotGroups = [],
  searchTerm = '',
}: GanttChartProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<React.CSSProperties>({ left: 12, top: 12 });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const autoScrollKeyRef = useRef('');
  const now = currentTime || new Date();

  useEffect(() => {
    setCurrentPage(1);
  }, [groupBy, searchTerm, viewMode]);

  useEffect(() => {
    setTooltip((current) => {
      if (!current) return current;
      const freshTasks = current.tasks
        .map((currentTask) => tasks.find((task) => task.id === currentTask.id))
        .filter((task): task is ExtendedScheduleTask => Boolean(task));
      if (freshTasks.length > 0) {
        return { ...current, task: freshTasks[0], tasks: freshTasks };
      }
      return current.pinned ? current : null;
    });
  }, [tasks]);

  useEffect(() => {
    const handleWindowClick = () => {
      setTooltip((current) => (current?.pinned ? null : current));
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const { startDate, endDate, headers, columns, totalMinutes } = useMemo(() => {
    let start: Date;
    let end: Date;
    let nextColumns: Date[] = [];

    if (viewMode === 'Day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = addDays(start, 1);
      for (let hour = 0; hour < 24; hour += 1) {
        const point = new Date(start);
        point.setHours(hour);
        nextColumns.push(point);
      }
    } else if (viewMode === 'Week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = addDays(start, 7);
      nextColumns = eachDayOfInterval({ start, end: addDays(end, -1) });
    } else if (viewMode === 'Month') {
      start = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      end = addDays(monthEnd, 1);
      nextColumns = eachDayOfInterval({ start, end: monthEnd });
    } else {
      start = startOfYear(currentDate);
      end = addYears(start, 1);
      for (let month = 0; month < 12; month += 1) {
        const point = new Date(start);
        point.setMonth(month);
        nextColumns.push(point);
      }
    }

    const nextHeaders = nextColumns.map((date) => {
      if (viewMode === 'Day') return { label: format(date, 'H:00'), colSpan: 1 };
      if (viewMode === 'Week') return { label: format(date, 'M月d日 EEEE', { locale: zhCN }), colSpan: 1 };
      if (viewMode === 'Month') return { label: format(date, 'd日'), colSpan: 1 };
      return { label: format(date, 'M月'), colSpan: 1 };
    });

    return {
      startDate: start,
      endDate: end,
      headers: nextHeaders,
      columns: nextColumns,
      totalMinutes: Math.max(1, (end.getTime() - start.getTime()) / 60000),
    };
  }, [currentDate, viewMode]);

  const columnWidth = useMemo(() => {
    switch (viewMode) {
      case 'Day':
        return 48;
      case 'Week':
        return 240;
      case 'Month':
        return 56;
      case 'Year':
        return 150;
      default:
        return 100;
    }
  }, [viewMode]);

  const totalColumns = columns.length;
  const gridMinWidth = totalColumns * columnWidth;
  const minVisibleTaskWidth = viewMode === 'Year' ? 2 : viewMode === 'Month' ? 1 : 0.75;

  const groupedTasks = useMemo(() => {
    const createGroup = (
      groups: Record<string, Omit<TaskGroup, 'executions' | 'totalLanes'> & { executions: ExtendedScheduleTask[] }>,
      key: string,
      defaults: Omit<TaskGroup, 'executions' | 'totalLanes'>,
    ) => {
      if (!groups[key]) {
        groups[key] = {
          ...defaults,
          id: key,
          executions: [],
        };
      }
      return groups[key];
    };

    if (groupBy === 'task') {
      const groups: Record<string, Omit<TaskGroup, 'executions' | 'totalLanes'> & { executions: ExtendedScheduleTask[] }> = {};

      tasks.forEach((task) => {
        const key = task.taskGroupKey
          || task.scheduleUuid
          || `task_${normalizeGroupKey(task.name)}_${normalizeGroupKey(task.executionScopeLabel || task.clientName || '')}`;
        const group = createGroup(groups, key, {
          id: key,
          name: task.name,
          robotName: formatCompactNames(task.robotNames || [task.robotName], '未知应用'),
          robotNames: task.robotNames,
          clientName: task.clientName || '未知账号',
          scopeLabel: task.executionScopeLabel || formatCompactNames(task.clientNames || [task.clientName], '未指定执行范围'),
          groupNames: task.groupNames,
        });
        group.executions.push(task);
      });

      return Object.values(groups);
    }

    const groups: Record<string, Omit<TaskGroup, 'executions' | 'totalLanes'> & { executions: ExtendedScheduleTask[] }> = {};

    robotClients.forEach((client) => {
      const key = client.robotClientName || client.windowsUserName;
      if (!key) return;
      const rowKey = getRowGroupKey(key, false);
      createGroup(groups, rowKey, {
        id: rowKey,
        name: key,
        robotName: '-',
        clientName: key,
        isGroup: false,
      });
    });

    tasks.forEach((task) => {
      const groupNames = uniqueValues(task.groupNames || []);
      const actualAccountNames = uniqueValues(task.actualClientNames || []);
      const accountNames = task.isHistorical && actualAccountNames.length > 0
        ? actualAccountNames
        : uniqueValues([...(task.clientNames || []), task.clientName]);
      const targetRows = [
        ...groupNames.map((name) => ({ name, isGroup: true })),
        ...((task.isRealtime || groupNames.length === 0)
          ? (accountNames.length > 0 ? accountNames : ['未指定账号']).map((name) => ({ name, isGroup: false }))
          : []),
      ];

      targetRows.forEach(({ name, isGroup }) => {
        const rowKey = getRowGroupKey(name, isGroup);
        const group = createGroup(groups, rowKey, {
          id: rowKey,
          name,
          robotName: '-',
          clientName: name,
          isGroup,
          isFallbackGroup: false,
        });
        group.executions.push(task);
      });
    });

    const result = Object.values(groups);
    if (!searchTerm) return result;
    return result.filter((group) => matchesRobotGroupKeyword(group.name, searchTerm));
  }, [groupBy, robotClients, robotGroups, searchTerm, tasks]);

  const groupedTasksWithLanes = useMemo<TaskGroup[]>(
    () => groupedTasks.map((group) => {
      const visibleExecutions = group.executions
        .filter((task) => task.endDate > startDate && task.startDate < endDate)
        .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

      const lanes: Date[] = [];
      const executions = visibleExecutions.map((task) => {
        let laneIndex = lanes.findIndex((laneEnd) => laneEnd <= task.startDate);
        if (laneIndex === -1) {
          laneIndex = lanes.length;
          lanes.push(task.endDate);
        } else {
          lanes[laneIndex] = task.endDate;
        }

        return { ...task, lane: laneIndex };
      });

      return {
        ...group,
        executions,
        totalLanes: Math.max(1, lanes.length),
      };
    }).sort((left, right) => {
      const leftRealtime = left.executions.some((task) => task.isRealtime);
      const rightRealtime = right.executions.some((task) => task.isRealtime);
      if (leftRealtime !== rightRealtime) return rightRealtime ? 1 : -1;

      const leftNext = left.executions[0]?.startDate.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightNext = right.executions[0]?.startDate.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftNext !== rightNext) return leftNext - rightNext;

      return left.name.localeCompare(right.name, 'zh-CN');
    }),
    [endDate, groupedTasks, startDate],
  );

  const paginatedGroups = useMemo(() => {
    if (groupBy !== 'task') return groupedTasksWithLanes;
    const start = (currentPage - 1) * pageSize;
    return groupedTasksWithLanes.slice(start, start + pageSize);
  }, [currentPage, groupBy, groupedTasksWithLanes, pageSize]);

  const totalPages = Math.max(1, Math.ceil(groupedTasksWithLanes.length / pageSize));

  useEffect(() => {
    setCurrentPage((value) => Math.min(Math.max(1, value), totalPages));
  }, [totalPages]);

  const isNowVisible = now >= startDate && now < endDate;
  const nowLeftPercent = isNowVisible
    ? ((now.getTime() - startDate.getTime()) / (totalMinutes * 60 * 1000)) * 100
    : -1;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isNowVisible) return;

    const autoScrollKey = `${groupBy}-${viewMode}-${startDate.toISOString()}-${endDate.toISOString()}`;
    if (autoScrollKeyRef.current === autoScrollKey) return;
    autoScrollKeyRef.current = autoScrollKey;

    const nowLeftPx = (nowLeftPercent / 100) * gridMinWidth;
    container.scrollLeft = Math.max(0, nowLeftPx - container.clientWidth * 0.45);
  }, [endDate, gridMinWidth, groupBy, isNowVisible, nowLeftPercent, startDate, viewMode]);

  const getTaskColor = (task: ExtendedScheduleTask) => {
    if (task.isRealtime) return '#1f6feb';
    if (task.status === 'failed') return '#f85149';
    if (task.status === 'running') return '#58a6ff';
    if (task.status === 'completed') return '#3fb950';

    let hash = 0;
    for (let index = 0; index < task.name.length; index += 1) {
      hash = task.name.charCodeAt(index) + ((hash << 5) - hash);
    }

    return `hsl(${Math.abs(hash) % 360} 58% 52%)`;
  };

  const getTaskPosition = (task: ExtendedScheduleTask & { lane: number }) => {
    const visibleStart = task.startDate < startDate ? startDate : task.startDate;
    const visibleEnd = task.endDate > endDate ? endDate : task.endDate;
    const totalMs = Math.max(1, totalMinutes * 60 * 1000);
    const rawLeftPx = Math.max(0, ((visibleStart.getTime() - startDate.getTime()) / totalMs) * gridMinWidth);
    const rightPx = Math.min(gridMinWidth, ((visibleEnd.getTime() - startDate.getTime()) / totalMs) * gridMinWidth);
    const rawWidthPx = Math.max(0, ((visibleEnd.getTime() - visibleStart.getTime()) / totalMs) * gridMinWidth);
    const realtimeMinWidth = task.isRealtime ? 8 : minVisibleTaskWidth;
    const widthPx = Math.min(
      Math.max(realtimeMinWidth, rawWidthPx),
      Math.max(realtimeMinWidth, gridMinWidth - rawLeftPx),
    );
    const leftPx = task.isRealtime ? Math.max(0, rightPx - widthPx) : rawLeftPx;

    return {
      leftPx,
      rawWidthPx,
      topPx: 4 + task.lane * 18,
      widthPx,
    };
  };

  const getClusterColor = (clusterTasks: Array<ExtendedScheduleTask & { lane: number }>) => {
    if (clusterTasks.some((task) => task.isRealtime)) return '#1f6feb';
    if (clusterTasks.some((task) => task.status === 'failed')) return '#f85149';
    if (clusterTasks.some((task) => task.status === 'running')) return '#58a6ff';
    if (clusterTasks.every((task) => task.status === 'completed')) return '#3fb950';
    return getTaskColor(clusterTasks[0]);
  };

  const buildGanttItems = (executions: Array<ExtendedScheduleTask & { lane: number }>) => {
    const positioned = executions
      .map((task) => ({
        task,
        ...getTaskPosition(task),
      }))
      .sort((left, right) => {
        if (left.task.lane !== right.task.lane) return left.task.lane - right.task.lane;
        return left.leftPx - right.leftPx;
      });

    if (viewMode === 'Day') {
      return positioned.map((item) => ({
        id: item.task.id,
        task: item.task,
        tasks: [item.task],
        isCluster: false,
        leftPx: item.leftPx,
        rawWidthPx: item.rawWidthPx,
        title: item.task.name,
        topPx: item.topPx,
        widthPx: item.widthPx,
        color: getTaskColor(item.task),
      }));
    }

    const clusterGapPx = viewMode === 'Week' ? 18 : viewMode === 'Month' ? 14 : 10;
    const clusters: Array<typeof positioned> = [];

    positioned.forEach((item) => {
      const lastCluster = clusters[clusters.length - 1];
      if (!lastCluster) {
        clusters.push([item]);
        return;
      }

      const lastItem = lastCluster[lastCluster.length - 1];
      const lastRightPx = Math.max(...lastCluster.map((clusterItem) => clusterItem.leftPx + clusterItem.widthPx));
      if (lastItem.task.lane === item.task.lane && item.leftPx <= lastRightPx + clusterGapPx) {
        lastCluster.push(item);
        return;
      }

      clusters.push([item]);
    });

    return clusters.map((clusterItems) => {
      const clusterTasks = clusterItems.map((item) => item.task);
      const firstItem = clusterItems[0];
      const leftPx = Math.min(...clusterItems.map((item) => item.leftPx));
      const rightPx = Math.max(...clusterItems.map((item) => item.leftPx + item.widthPx));
      const widthPx = clusterItems.length > 1 ? Math.max(24, rightPx - leftPx) : firstItem.widthPx;
      const title = clusterItems.length > 1
        ? `${clusterItems.length} 条任务\n${clusterTasks.slice(0, 5).map((task) => `${format(task.startDate, 'MM-dd HH:mm')} ${task.name}`).join('\n')}`
        : firstItem.task.name;

      return {
        id: clusterItems.length > 1
          ? `cluster-${firstItem.task.lane}-${clusterItems.map((item) => item.task.id).join('-')}`
          : firstItem.task.id,
        task: firstItem.task,
        tasks: clusterTasks,
        isCluster: clusterItems.length > 1,
        leftPx,
        rawWidthPx: rightPx - leftPx,
        title,
        topPx: firstItem.topPx,
        widthPx,
        color: clusterItems.length > 1 ? getClusterColor(clusterTasks) : getTaskColor(firstItem.task),
      };
    });
  };

  const openTooltip = (
    task: ExtendedScheduleTask,
    event: React.MouseEvent<HTMLDivElement>,
    pinned: boolean,
    tooltipTasks: ExtendedScheduleTask[] = [task],
    key: string = task.id,
  ) => {
    event.stopPropagation();
    setTooltipPosition(getTooltipPosition(event.clientX, event.clientY));
    setTooltip({
      key,
      task,
      tasks: tooltipTasks,
      x: event.clientX,
      y: event.clientY,
      pinned,
    });
  };

  const tooltipTasks = tooltip?.tasks || [];
  const isClusterTooltip = tooltipTasks.length > 1;
  const clusterStart = isClusterTooltip
    ? new Date(Math.min(...tooltipTasks.map((task) => task.startDate.getTime())))
    : null;
  const clusterEnd = isClusterTooltip
    ? new Date(Math.max(...tooltipTasks.map((task) => task.endDate.getTime())))
    : null;
  const clusterAccounts = isClusterTooltip
    ? uniqueValues(tooltipTasks.flatMap((task) => [...(task.clientNames || []), task.clientName]))
    : [];
  const clusterStatusCounts = isClusterTooltip
    ? tooltipTasks.reduce<Record<string, number>>((summary, task) => {
      const status = getStatusLabel(task.status);
      return {
        ...summary,
        [status]: (summary[status] || 0) + 1,
      };
    }, {})
    : {};

  const tooltipRows = tooltip
    ? isClusterTooltip
      ? [
        ['任务数量', `${tooltipTasks.length} 条`],
        ['状态分布', Object.entries(clusterStatusCounts).map(([status, count]) => `${status} ${count}`).join('，')],
        ['账号', formatCompactNames(clusterAccounts, '未返回账号')],
        ['开始范围', clusterStart ? format(clusterStart, 'yyyy-MM-dd HH:mm:ss') : '-'],
        ['结束范围', clusterEnd ? format(clusterEnd, 'yyyy-MM-dd HH:mm:ss') : '-'],
      ]
      : [
        ['状态', getStatusLabel(tooltip.task.status)],
        ['类型', getTaskTypeLabel(tooltip.task)],
        ['应用', tooltip.task.robotName || '未知应用'],
        ['执行范围', tooltip.task.executionScopeLabel || tooltip.task.clientName || '未指定执行范围'],
        ...(tooltip.task.groupNames?.length
          ? [['机器人组', formatCompactNames(tooltip.task.groupNames, '未返回分组')]]
          : []),
        ...(tooltip.task.clientNames?.length
          ? [['账号', formatCompactNames(tooltip.task.clientNames, '未返回账号')]]
          : []),
        [tooltip.task.status === 'pending' ? '预计开始时间' : '开始时间', format(tooltip.task.startDate, 'yyyy-MM-dd HH:mm:ss')],
        [
          tooltip.task.isRealtime ? '截至当前' : tooltip.task.status === 'pending' ? '预计结束时间' : '结束时间',
          format(tooltip.task.endDate, 'yyyy-MM-dd HH:mm:ss'),
        ],
        [
          tooltip.task.isRealtime ? '已运行时长' : tooltip.task.status === 'pending' ? '预计运行时长' : '运行时长',
          formatDuration(tooltip.task.startDate, tooltip.task.endDate),
        ],
        ...(tooltip.task.isRealtime && tooltip.task.estimatedEndDate
          ? [['预计结束时间', format(tooltip.task.estimatedEndDate, 'yyyy-MM-dd HH:mm:ss')]]
          : tooltip.task.isRealtime
            ? [['预计结束时间', '暂无历史均值']]
            : []),
      ]
    : [];

  useLayoutEffect(() => {
    if (!tooltip) return undefined;

    const updateTooltipPosition = () => {
      const rect = tooltipRef.current?.getBoundingClientRect();
      setTooltipPosition(getTooltipPosition(
        tooltip.x,
        tooltip.y,
        rect?.width || 340,
        rect?.height || 300,
      ));
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    return () => window.removeEventListener('resize', updateTooltipPosition);
  }, [tooltip?.key, tooltip?.x, tooltip?.y, tooltip?.pinned, tooltip?.tasks.length, tooltipRows.length]);

  return (
    <div className="w-full overflow-visible rounded-md border bg-white shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
      <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-visible shadow-inner">
        <div className="relative min-w-max">
          <div className="sticky top-0 z-30 flex border-b bg-gray-50 shadow-sm dark:border-[#30363d] dark:bg-[#21262d]">
            <div className="sticky left-0 z-40 flex w-72 shrink-0 items-center border-r bg-gray-50 p-2 text-sm font-semibold dark:border-[#30363d] dark:bg-[#21262d] dark:text-[#f0f6fc]">
              任务信息
            </div>
            <div className="relative flex flex-1" style={{ minWidth: `${gridMinWidth}px` }}>
              {headers.map((header, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-center whitespace-nowrap border-r p-2 text-[11px] font-medium text-gray-500 dark:border-[#30363d] dark:text-[#8b949e]',
                    viewMode === 'Day' ? 'justify-start text-left' : 'justify-center text-center',
                  )}
                  style={{ width: `${(header.colSpan / totalColumns) * 100}%` }}
                >
                  {header.label}
                </div>
              ))}

              {isNowVisible && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-red-500"
                  style={{ left: `${nowLeftPercent}%` }}
                >
                  <div className="absolute top-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white shadow-sm">
                    当前
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            {paginatedGroups.length === 0 ? (
              <div className="bg-white p-12 text-center text-sm text-gray-500 dark:bg-[#161b22] dark:text-[#8b949e]">
                {searchTerm ? '没有找到匹配的账号或任务。' : '该时间段内没有安排任务。'}
              </div>
            ) : (
              paginatedGroups.map((group) => (
                <div key={group.id} className="group/row flex border-b hover:bg-gray-50 dark:border-[#30363d] dark:hover:bg-[#21262d]">
                  <div className="sticky left-0 z-20 flex w-72 shrink-0 flex-col justify-center gap-1 border-r bg-white p-2 px-3 group-hover/row:bg-gray-50 dark:border-[#30363d] dark:bg-[#161b22] dark:group-hover/row:bg-[#21262d]">
                    {groupBy === 'task' ? (
                      <>
                        <div className="truncate text-xs font-medium text-gray-800 dark:text-[#f0f6fc]" title={group.name}>
                          {group.name}
                        </div>
                        <div className="group/robot relative flex truncate text-[10px] text-blue-600 dark:text-[#58a6ff]">
                          <AppWindow className="mr-1 h-3 w-3 shrink-0" />
                          <span className="truncate" title={group.robotNames?.join(', ') || group.robotName}>
                            {group.robotName}
                          </span>
                        </div>
                        <div className="flex truncate text-[10px] text-green-600 dark:text-[#3fb950]" title={group.scopeLabel || group.clientName}>
                          {group.groupNames?.length ? (
                            <Users className="mr-1 h-3 w-3 shrink-0" />
                          ) : (
                            <Bot className="mr-1 h-3 w-3 shrink-0" />
                          )}
                          <span className="truncate">{group.scopeLabel || group.clientName}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex truncate text-xs font-medium text-gray-800 dark:text-[#f0f6fc]" title={group.name}>
                          {group.isGroup && !group.isFallbackGroup ? (
                            <Users className="mr-1 h-3 w-3 shrink-0 text-purple-600 dark:text-[#a371f7]" />
                          ) : (
                            <Bot className="mr-1 h-3 w-3 shrink-0 text-green-600 dark:text-[#3fb950]" />
                          )}
                          <span className="truncate">{group.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-[#8b949e]">
                          {group.isGroup ? '机器人组任务' : '任务数量'}: {group.executions.length}
                          {group.executions.some((task) => task.status === 'running') && (
                            <span className="ml-1 text-blue-600 dark:text-[#58a6ff]">
                              执行中 {group.executions.filter((task) => task.status === 'running').length}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    className="relative flex-1"
                    style={{ minHeight: `${Math.max(42, group.totalLanes * 18 + 10)}px`, minWidth: `${gridMinWidth}px` }}
                  >
                    <div className="pointer-events-none absolute inset-0 flex">
                      {columns.map((_, index) => (
                        <div
                          key={index}
                          className="h-full border-r border-gray-100 dark:border-[#30363d]"
                          style={{ width: `${(1 / totalColumns) * 100}%` }}
                        />
                      ))}
                    </div>

                    {isNowVisible && (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500/50"
                        style={{ left: `${nowLeftPercent}%` }}
                      />
                    )}

                    {buildGanttItems(group.executions).map((item) => {
                      const task = item.task;
                      const labelMinWidth = viewMode === 'Day' ? 28 : 40;

                      return (
                        <div
                          key={item.id}
                          title={item.title}
                          className={cn(
                            'absolute flex h-4 cursor-pointer items-center truncate rounded-sm px-1 text-[9px] text-white shadow-sm transition-all hover:z-30 hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 dark:hover:ring-offset-[#0d1117]',
                            task.isRealtime && 'h-5 rounded-md shadow-md ring-2 ring-blue-300/70 animate-pulse dark:ring-[#58a6ff]/80',
                            task.status === 'running' && 'animate-pulse ring-1 ring-blue-400',
                            task.status === 'pending' ? 'border border-dashed border-white/30 opacity-70' : 'opacity-100',
                            item.isCluster && 'h-5 justify-center rounded-full px-2 text-[10px] font-semibold opacity-100 ring-2 ring-white/80 dark:ring-[#0d1117]',
                          )}
                          style={{
                            left: `${item.leftPx}px`,
                            width: `${item.widthPx}px`,
                            top: `${item.topPx}px`,
                            backgroundColor: item.color,
                          }}
                          onMouseEnter={(event) => openTooltip(task, event, false, item.tasks, item.id)}
                          onMouseMove={(event) => {
                            setTooltip((current) => (
                              current && !current.pinned && current.key === item.id
                                ? { ...current, x: event.clientX, y: event.clientY }
                                : current
                            ));
                          }}
                          onMouseLeave={() => {
                            setTooltip((current) => (current?.pinned ? current : null));
                          }}
                          onClick={(event) => {
                            if (tooltip?.pinned && tooltip.key === item.id) {
                              event.stopPropagation();
                              setTooltip(null);
                              return;
                            }
                            openTooltip(task, event, true, item.tasks, item.id);
                          }}
                        >
                          {task.isRealtime && (
                            <span className="pointer-events-none absolute bottom-0 right-0 top-0 w-1 rounded-full bg-blue-700 shadow-[0_0_0_1px_rgba(255,255,255,0.9)] dark:bg-[#79c0ff]" />
                          )}
                          {item.isCluster
                            ? item.tasks.length
                            : item.rawWidthPx >= labelMinWidth && format(task.startDate, viewMode === 'Day' ? 'HH:mm' : 'MM-dd HH:mm')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {groupBy === 'task' && groupedTasksWithLanes.length > 0 && (
        <div className="z-30 flex items-center justify-between border-t bg-white px-4 py-2 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:border-[#30363d] dark:bg-[#161b22]">
          <div className="flex items-center text-xs text-gray-500 dark:text-[#8b949e]">共 {groupedTasksWithLanes.length} 条记录</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-[#8b949e]">每页显示</span>
              <select
                className="rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 100, 200].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500 dark:text-[#8b949e]">条</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border p-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#30363d] dark:hover:bg-[#21262d]"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-600 dark:text-[#c9d1d9]">
                {currentPage} / {totalPages}
              </span>
              <button
                className="rounded border p-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#30363d] dark:hover:bg-[#21262d]"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((value) => value + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          ref={tooltipRef}
          className={cn(
            'fixed z-[120] flex max-h-[calc(100vh-24px)] w-[340px] flex-col rounded-xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur dark:border-[#30363d] dark:bg-[#161b22]/95',
            !tooltip.pinned && 'pointer-events-none',
          )}
          style={tooltipPosition}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-[#30363d]">
            <div>
              <div className="break-words text-sm font-semibold text-gray-900 dark:text-[#f0f6fc]">
                {isClusterTooltip ? `${tooltipTasks.length} 条聚合任务` : tooltip.task.name}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-[#8b949e]">
                {isClusterTooltip ? '周/月视图自动聚合，切到日视图可看单条任务' : `${getTaskTypeLabel(tooltip.task)} · ${getStatusLabel(tooltip.task.status)}`}
              </div>
            </div>
            <button
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-[#c9d1d9]"
              onClick={() => setTooltip(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 space-y-2 overflow-y-auto px-4 py-3 text-xs text-gray-700 dark:text-[#c9d1d9]">
            {tooltipRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-gray-500 dark:text-[#8b949e]">{label}</span>
                <span className="text-right font-medium text-gray-900 dark:text-[#f0f6fc]">{value}</span>
              </div>
            ))}
            {isClusterTooltip && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-[#30363d]">
                {tooltipTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="rounded-md bg-gray-50 px-2.5 py-2 dark:bg-[#0d1117]">
                    <div className="break-words font-medium text-gray-900 dark:text-[#f0f6fc]">{task.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-[#8b949e]">
                      <span>{format(task.startDate, 'MM-dd HH:mm')}</span>
                      <span>{getStatusLabel(task.status)}</span>
                      <span>{formatCompactNames(task.clientNames || [task.clientName], '未返回账号')}</span>
                    </div>
                  </div>
                ))}
                {tooltipTasks.length > 8 && (
                  <div className="text-[11px] text-gray-500 dark:text-[#8b949e]">
                    还有 {tooltipTasks.length - 8} 条任务未展开
                  </div>
                )}
              </div>
            )}
            {!isClusterTooltip && tooltip.task.cronExpr && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-500 dark:text-[#8b949e]">调度规则</span>
                <span className="break-all text-right font-medium text-gray-900 dark:text-[#f0f6fc]">{tooltip.task.cronExpr}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 dark:border-[#30363d] dark:text-[#8b949e]">
            {tooltip.pinned ? '已固定详情，点击当前颗粒或右上角关闭。' : '悬浮查看详情，点击颗粒可固定打开。'}
          </div>
        </div>
      )}
    </div>
  );
}
