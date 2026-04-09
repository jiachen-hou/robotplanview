import React, { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
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
  isGroup?: boolean;
  executions: Array<ExtendedScheduleTask & { lane: number }>;
  totalLanes: number;
};

type TooltipState = {
  task: ExtendedScheduleTask;
  x: number;
  y: number;
  pinned: boolean;
};

interface GanttChartProps {
  tasks: ExtendedScheduleTask[];
  viewMode: ViewMode;
  currentDate: Date;
  groupBy?: 'task' | 'robot';
  robotClients?: any[];
  robotGroups?: any[];
  searchTerm?: string;
}

function matchesRobotGroupKeyword(value: string | undefined, keyword: string): boolean {
  if (!value) return false;

  const normalizedValue = value.trim().toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedValue || !normalizedKeyword) return false;

  const accountPart = normalizedValue.split('@')[0];
  return normalizedValue.includes(normalizedKeyword) || accountPart.includes(normalizedKeyword);
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'pending':
      return '待执行';
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'finish':
      return '完成';
    case 'error':
      return '异常';
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
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  return `${seconds} 秒`;
}

function getTooltipPosition(x: number, y: number) {
  const width = 320;
  const height = 260;
  const padding = 16;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1600;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;

  const nextX = Math.min(Math.max(padding, x + 14), viewportWidth - width - padding);
  const nextY = Math.min(Math.max(padding, y + 14), viewportHeight - height - padding);

  return { left: nextX, top: nextY };
}

export function GanttChart({
  tasks,
  viewMode,
  currentDate,
  groupBy = 'task',
  robotClients = [],
  robotGroups = [],
  searchTerm = '',
}: GanttChartProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [tasks, groupBy, searchTerm, viewMode]);

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
    let nextHeaders: { label: string; colSpan: number }[] = [];
    let nextColumns: Date[] = [];

    if (viewMode === 'Day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);

      for (let hour = 0; hour < 24; hour += 1) {
        const point = new Date(start);
        point.setHours(hour);
        nextColumns.push(point);
        nextHeaders.push({ label: `${hour}:00`, colSpan: 1 });
      }
    } else if (viewMode === 'Week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = addDays(start, 6);
      end.setHours(23, 59, 59, 999);
      nextColumns = eachDayOfInterval({ start, end });
      nextHeaders = nextColumns.map((date) => ({
        label: format(date, 'M月d日 EEEE', { locale: zhCN }),
        colSpan: 1,
      }));
    } else if (viewMode === 'Month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
      end.setHours(23, 59, 59, 999);
      nextColumns = eachDayOfInterval({ start, end });
      nextHeaders = nextColumns.map((date) => ({
        label: format(date, 'd日', { locale: zhCN }),
        colSpan: 1,
      }));
    } else {
      start = startOfYear(currentDate);
      end = endOfYear(currentDate);
      end.setHours(23, 59, 59, 999);

      let monthStart = start;
      for (let month = 0; month < 12; month += 1) {
        nextColumns.push(monthStart);
        nextHeaders.push({
          label: format(monthStart, 'M月', { locale: zhCN }),
          colSpan: 1,
        });
        monthStart = addDays(endOfMonth(monthStart), 1);
      }
    }

    return {
      startDate: start,
      endDate: end,
      headers: nextHeaders,
      columns: nextColumns,
      totalMinutes: differenceInMinutes(end, start),
    };
  }, [currentDate, viewMode]);

  const totalColumns = columns.length;
  const columnWidth = useMemo(() => {
    switch (viewMode) {
      case 'Day':
        return 120;
      case 'Week':
        return 320;
      case 'Month':
        return 72;
      case 'Year':
        return 150;
      default:
        return 100;
    }
  }, [viewMode]);

  const gridMinWidth = totalColumns * columnWidth;

  const minVisibleTaskWidth = useMemo(() => {
    switch (viewMode) {
      case 'Day':
        return 0.75;
      case 'Week':
        return 0.5;
      case 'Month':
        return 1;
      case 'Year':
        return 2;
      default:
        return 0.75;
    }
  }, [viewMode]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'task') {
      const groups: Record<string, Omit<TaskGroup, 'executions' | 'totalLanes'> & { executions: ExtendedScheduleTask[] }> = {};

      tasks.forEach((task) => {
        const key = task.scheduleUuid || `${task.name}_${task.robotName}_${task.clientName}`;
        if (!groups[key]) {
          groups[key] = {
            id: key,
            name: task.name,
            robotName: task.robotName || '未知应用',
            robotNames: task.robotNames,
            clientName: task.clientName || '未知账号',
            executions: [],
          };
        }

        groups[key].executions.push(task);
      });

      return Object.values(groups);
    }

    const groups: Record<string, Omit<TaskGroup, 'executions' | 'totalLanes'> & { executions: ExtendedScheduleTask[] }> = {};

    robotClients.forEach((client) => {
      const key = client.robotClientName;
      if (!key) return;
      groups[key] = {
        id: key,
        name: key,
        robotName: '-',
        clientName: key,
        isGroup: false,
        executions: [],
      };
    });

    robotGroups.forEach((group) => {
      const key = group.name;
      if (!key) return;
      groups[key] = {
        id: `group_${key}`,
        name: key,
        robotName: '-',
        clientName: key,
        isGroup: true,
        executions: [],
      };
    });

    tasks.forEach((task) => {
      const key = task.clientName || '未知账号';
      if (!groups[key]) {
        groups[key] = {
          id: key,
          name: key,
          robotName: '-',
          clientName: key,
          isGroup: false,
          executions: [],
        };
      }

      groups[key].executions.push(task);
    });

    const result = Object.values(groups);
    if (!searchTerm) return result;

    return result.filter((group) => matchesRobotGroupKeyword(group.name, searchTerm) && group.executions.length > 0);
  }, [groupBy, robotClients, robotGroups, searchTerm, tasks]);

  const groupedTasksWithLanes = useMemo<TaskGroup[]>(() => {
    return groupedTasks.map((group) => {
      const visibleExecutions = group.executions
        .filter((task) => task.endDate >= startDate && task.startDate <= endDate)
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
    });
  }, [endDate, groupedTasks, startDate]);

  const paginatedGroups = useMemo(() => {
    if (groupBy === 'robot') return groupedTasksWithLanes;
    const start = (currentPage - 1) * pageSize;
    return groupedTasksWithLanes.slice(start, start + pageSize);
  }, [currentPage, groupBy, groupedTasksWithLanes, pageSize]);

  const now = new Date();
  const isNowVisible = now >= startDate && now <= endDate;
  const nowLeftPercent = isNowVisible
    ? ((now.getTime() - startDate.getTime()) / (totalMinutes * 60 * 1000)) * 100
    : -1;

  const getTaskColor = (task: ExtendedScheduleTask) => {
    if (task.status === 'failed') return 'hsl(0 84% 60%)';
    if (task.status === 'running') return 'hsl(200 84% 50%)';
    if (task.status === 'completed') return 'hsl(142 76% 45%)';

    let hash = 0;
    for (let index = 0; index < task.name.length; index += 1) {
      hash = task.name.charCodeAt(index) + ((hash << 5) - hash);
    }

    return `hsl(${Math.abs(hash) % 360} 60% 55%)`;
  };

  const openTooltip = (
    task: ExtendedScheduleTask,
    event: React.MouseEvent<HTMLDivElement>,
    pinned: boolean,
  ) => {
    event.stopPropagation();
    setTooltip({
      task,
      x: event.clientX,
      y: event.clientY,
      pinned,
    });
  };

  return (
    <div className="flex flex-col w-full border rounded-md bg-white max-h-[calc(100vh-280px)] shadow-sm overflow-hidden">
      <div className="flex-1 overflow-auto shadow-inner">
        <div className="min-w-max relative">
          <div className="flex border-b bg-gray-50 sticky top-0 z-30 shadow-sm">
            <div className="w-64 shrink-0 border-r p-2 font-semibold text-sm flex items-center bg-gray-50 sticky left-0 z-40">
              任务信息
            </div>
            <div className="flex-1 flex relative" style={{ minWidth: `${gridMinWidth}px` }}>
              {headers.map((header, index) => (
                <div
                  key={index}
                  className="border-r p-2 text-center text-[11px] font-medium text-gray-500 whitespace-nowrap flex items-center justify-center"
                  style={{ width: `${(header.colSpan / totalColumns) * 100}%` }}
                >
                  {header.label}
                </div>
              ))}

              {isNowVisible && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                  style={{ left: `${nowLeftPercent}%` }}
                >
                  <div className="absolute top-1 -translate-x-1/2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                    当前
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            {paginatedGroups.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm bg-white">
                {searchTerm ? '没有找到匹配的账号或任务。' : '该时间段内没有安排任务。'}
              </div>
            ) : (
              paginatedGroups.map((group) => (
                <div key={group.id} className="flex border-b hover:bg-gray-50 group/row">
                  <div className="w-64 shrink-0 border-r p-1 px-2 flex flex-col justify-center gap-0.5 bg-white group-hover/row:bg-gray-50 sticky left-0 z-20">
                    {groupBy === 'task' ? (
                      <>
                        <div className="text-xs font-medium truncate text-gray-800" title={group.name}>
                          {group.name}
                        </div>
                        <div className="flex items-center text-[10px] text-blue-600 truncate relative group/robot">
                          <AppWindow className="w-3 h-3 mr-1 shrink-0" />
                          <span className="truncate" title={group.robotNames?.join(', ') || group.robotName}>
                            {group.robotName}
                          </span>
                          {group.robotNames && group.robotNames.length > 1 && (
                            <div className="hidden group-hover/robot:block absolute left-0 top-full mt-1 p-2 bg-white border rounded shadow-xl z-[100] min-w-[180px] text-gray-700 pointer-events-none">
                              <div className="font-bold text-[11px] mb-1 border-b pb-1 text-blue-700">
                                关联应用 ({group.robotNames.length})
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {group.robotNames.map((name, index) => (
                                  <div key={index} className="py-1 text-[10px] border-b border-gray-50 last:border-0">
                                    {name}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center text-[10px] text-green-600 truncate" title={`账号: ${group.clientName}`}>
                          <Bot className="w-3 h-3 mr-1 shrink-0" />
                          <span className="truncate">{group.clientName}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center text-xs font-medium text-gray-800 truncate" title={group.name}>
                          {group.isGroup ? (
                            <Users className="w-3 h-3 mr-1 shrink-0 text-purple-600" />
                          ) : (
                            <Bot className="w-3 h-3 mr-1 shrink-0 text-green-600" />
                          )}
                          <span className="truncate">{group.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">任务数量: {group.executions.length}</div>
                      </>
                    )}
                  </div>

                  <div
                    className="flex-1 relative"
                    style={{ minHeight: `${Math.max(40, group.totalLanes * 20 + 8)}px`, minWidth: `${gridMinWidth}px` }}
                  >
                    <div className="absolute inset-0 flex pointer-events-none">
                      {columns.map((_, index) => (
                        <div
                          key={index}
                          className="border-r h-full border-gray-100"
                          style={{ width: `${(1 / totalColumns) * 100}%` }}
                        />
                      ))}
                    </div>

                    {isNowVisible && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20 pointer-events-none"
                        style={{ left: `${nowLeftPercent}%` }}
                      />
                    )}

                    {group.executions.map((task) => {
                      const visibleStart = task.startDate < startDate ? startDate : task.startDate;
                      const visibleEnd = task.endDate > endDate ? endDate : task.endDate;
                      const totalMs = Math.max(1, totalMinutes * 60 * 1000);
                      const leftPx = Math.max(0, ((visibleStart.getTime() - startDate.getTime()) / totalMs) * gridMinWidth);
                      const rawWidthPx = Math.max(0, ((visibleEnd.getTime() - visibleStart.getTime()) / totalMs) * gridMinWidth);
                      const widthPx = Math.min(
                        Math.max(minVisibleTaskWidth, rawWidthPx),
                        Math.max(minVisibleTaskWidth, gridMinWidth - leftPx),
                      );
                      const labelMinWidth = viewMode === 'Day' ? 28 : 40;

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'absolute h-4 rounded-sm shadow-sm flex items-center px-1 text-[9px] text-white truncate transition-all cursor-pointer hover:z-30 hover:ring-2 hover:ring-offset-1 hover:ring-indigo-400',
                            task.status === 'running' && 'animate-pulse ring-1 ring-blue-400',
                            task.status === 'pending' ? 'opacity-70 border border-dashed border-white/30' : 'opacity-100',
                          )}
                          style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                            top: `${4 + task.lane * 20}px`,
                            backgroundColor: getTaskColor(task),
                          }}
                          onMouseEnter={(event) => openTooltip(task, event, false)}
                          onMouseMove={(event) => {
                            setTooltip((current) => (
                              current && !current.pinned && current.task.id === task.id
                                ? { ...current, x: event.clientX, y: event.clientY }
                                : current
                            ));
                          }}
                          onMouseLeave={() => {
                            setTooltip((current) => (current?.pinned ? current : null));
                          }}
                          onClick={(event) => {
                            if (tooltip?.pinned && tooltip.task.id === task.id) {
                              event.stopPropagation();
                              setTooltip(null);
                              return;
                            }
                            openTooltip(task, event, true);
                          }}
                        >
                          {rawWidthPx >= labelMinWidth &&
                            format(task.startDate, viewMode === 'Day' ? 'HH:mm' : 'MM-dd HH:mm')}
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
        <div className="flex items-center justify-between px-4 py-2 border-t bg-white z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center text-xs text-gray-500">共 {groupedTasksWithLanes.length} 条记录</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">每页显示</span>
              <select
                className="border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
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
              <span className="text-xs text-gray-500">条</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600">
                {currentPage} / {Math.ceil(groupedTasksWithLanes.length / pageSize)}
              </span>
              <button
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage >= Math.ceil(groupedTasksWithLanes.length / pageSize)}
                onClick={() => setCurrentPage((value) => value + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="fixed z-[120] w-80 rounded-xl border border-gray-200 bg-white/95 backdrop-blur shadow-2xl"
          style={getTooltipPosition(tooltip.x, tooltip.y)}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900 break-words">{tooltip.task.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                {getTaskTypeLabel(tooltip.task)} · {getStatusLabel(tooltip.task.status)}
              </div>
            </div>
            <button
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              onClick={() => setTooltip(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 px-4 py-3 text-xs text-gray-700">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">状态</span>
              <span className="font-medium text-gray-900">{getStatusLabel(tooltip.task.status)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">类型</span>
              <span className="font-medium text-gray-900">{getTaskTypeLabel(tooltip.task)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">应用</span>
              <span className="font-medium text-right text-gray-900">{tooltip.task.robotName || '未知应用'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">账号</span>
              <span className="font-medium text-right text-gray-900">{tooltip.task.clientName || '未知账号'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">开始时间</span>
              <span className="font-medium text-right text-gray-900">{format(tooltip.task.startDate, 'yyyy-MM-dd HH:mm:ss')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">结束时间</span>
              <span className="font-medium text-right text-gray-900">{format(tooltip.task.endDate, 'yyyy-MM-dd HH:mm:ss')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">运行时长</span>
              <span className="font-medium text-right text-gray-900">{formatDuration(tooltip.task.startDate, tooltip.task.endDate)}</span>
            </div>
            {tooltip.task.cronExpr && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">调度规则</span>
                <span className="font-medium text-right text-gray-900 break-all">{tooltip.task.cronExpr}</span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
            {tooltip.pinned ? '已固定详情，点击当前颗粒或右上角关闭。' : '悬浮查看详情，点击颗粒可固定打开。'}
          </div>
        </div>
      )}
    </div>
  );
}
