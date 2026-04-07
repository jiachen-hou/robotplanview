import React, { useMemo, useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, eachDayOfInterval, isSameDay, differenceInDays, differenceInMinutes } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ExtendedScheduleTask } from '@/src/App';
import { Bot, AppWindow, Users, ChevronLeft, ChevronRight } from 'lucide-react';

export type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

export interface ScheduleTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface GanttChartProps {
  tasks: ExtendedScheduleTask[];
  viewMode: ViewMode;
  currentDate: Date;
  groupBy?: 'task' | 'robot';
  robotClients?: any[];
  robotGroups?: any[];
  searchTerm?: string;
}

export function GanttChart({ 
  tasks, 
  viewMode, 
  currentDate, 
  groupBy = 'task', 
  robotClients = [], 
  robotGroups = [],
  searchTerm = ''
}: GanttChartProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [tasks, groupBy]);

  const { startDate, endDate, headers, columns, totalMinutes } = useMemo(() => {
    let start, end;
    let headers: { label: string; colSpan: number }[] = [];
    let columns: Date[] = [];

    if (viewMode === 'Day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      
      for (let i = 0; i < 24; i++) {
        const d = new Date(start);
        d.setHours(i);
        columns.push(d);
        headers.push({ label: `${i}:00`, colSpan: 1 });
      }
    } else if (viewMode === 'Week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = addDays(start, 6);
      end.setHours(23, 59, 59, 999);
      columns = eachDayOfInterval({ start, end });
      headers = columns.map(date => ({ label: format(date, 'MMM d日 EEEE', { locale: zhCN }), colSpan: 1 }));
    } else if (viewMode === 'Month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
      end.setHours(23, 59, 59, 999);
      columns = eachDayOfInterval({ start, end });
      headers = columns.map(date => ({ label: format(date, 'd日', { locale: zhCN }), colSpan: 1 }));
    } else {
      start = startOfYear(currentDate);
      end = endOfYear(currentDate);
      end.setHours(23, 59, 59, 999);
      let currentMonthStart = start;
      for (let i = 0; i < 12; i++) {
        columns.push(currentMonthStart);
        headers.push({ label: format(currentMonthStart, 'M月', { locale: zhCN }), colSpan: 1 });
        currentMonthStart = addDays(endOfMonth(currentMonthStart), 1);
      }
    }

    return { startDate: start, endDate: end, headers, columns, totalMinutes: differenceInMinutes(end, start) };
  }, [viewMode, currentDate]);

  const totalColumns = columns.length;

  const columnWidth = useMemo(() => {
    switch (viewMode) {
      case 'Day': return 120;
      case 'Week': return 200;
      case 'Month': return 60;
      case 'Year': return 150;
      default: return 100;
    }
  }, [viewMode]);

  const gridMinWidth = totalColumns * columnWidth;

  function getTaskColor(task: ExtendedScheduleTask) {
    if (task.status === 'failed') return 'hsl(0, 84%, 60%)';
    if (task.status === 'running') return 'hsl(200, 84%, 50%)';
    if (task.status === 'completed') return 'hsl(142, 76%, 45%)';
    
    let hash = 0;
    for (let i = 0; i < task.name.length; i++) {
      hash = task.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 55%)`;
  }

  // Group tasks by schedule name, app, and robot OR by robot client
  const groupedTasks = useMemo(() => {
    if (groupBy === 'task') {
      const groups: Record<string, {
        id: string;
        name: string;
        robotName: string;
        robotNames?: string[];
        clientName: string;
        executions: ExtendedScheduleTask[];
      }> = {};

      tasks.forEach(task => {
        const key = `${task.name}_${task.robotName}_${task.clientName}`;
        if (!groups[key]) {
          groups[key] = {
            id: key,
            name: task.name,
            robotName: task.robotName || '未知应用',
            robotNames: task.robotNames,
            clientName: task.clientName || '未知机器人/组',
            executions: []
          };
        }
        groups[key].executions.push(task);
      });

      return Object.values(groups);
    } else {
      // Group by robot
      const groups: Record<string, {
        id: string;
        name: string;
        robotName: string;
        robotNames?: string[];
        clientName: string;
        isGroup?: boolean;
        executions: ExtendedScheduleTask[];
      }> = {};

      // Initialize with all robot clients
      robotClients.forEach(client => {
        const key = client.robotClientName;
        groups[key] = {
          id: key,
          name: client.robotClientName,
          robotName: '-',
          clientName: client.robotClientName,
          isGroup: false,
          executions: []
        };
      });

      // Initialize with all robot groups
      robotGroups.forEach(group => {
        const key = group.name;
        groups[key] = {
          id: `group_${key}`,
          name: key,
          robotName: '-',
          clientName: key,
          isGroup: true,
          executions: []
        };
      });

      // Add tasks to their respective robot clients
      tasks.forEach(task => {
        const key = task.clientName || '未知机器人/组';
        if (!groups[key]) {
          groups[key] = {
            id: key,
            name: key,
            robotName: '-',
            clientName: key,
            executions: []
          };
        }
        groups[key].executions.push(task);
      });

      const result = Object.values(groups);
      
      // 如果正在搜索，则只显示有任务的账号
      if (searchTerm) {
        return result.filter(g => g.executions.length > 0);
      }
      
      return result;
    }
  }, [tasks, groupBy, robotClients, robotGroups, searchTerm]);

  const groupedTasksWithLanes = useMemo(() => {
    return groupedTasks.map(group => {
      // Filter executions by current view's date range
      const visibleExecutions = group.executions.filter(task =>
        task.endDate >= startDate && task.startDate <= endDate
      );

      // Sort executions by start time
      const sortedExecutions = [...visibleExecutions].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      
      const lanes: Date[] = [];
      const executionsWithLane = sortedExecutions.map(task => {
        let laneIndex = lanes.findIndex(laneEnd => laneEnd <= task.startDate);
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
        executions: executionsWithLane,
        totalLanes: Math.max(1, lanes.length)
      };
    });
  }, [groupedTasks, startDate, endDate]);

  const paginatedGroups = useMemo(() => {
    if (groupBy === 'robot') return groupedTasksWithLanes;
    const start = (currentPage - 1) * pageSize;
    return groupedTasksWithLanes.slice(start, start + pageSize);
  }, [groupedTasksWithLanes, groupBy, currentPage, pageSize]);

  const now = new Date();
  const isNowVisible = now >= startDate && now <= endDate;
  const nowLeftPercent = isNowVisible ? ((now.getTime() - startDate.getTime()) / (totalMinutes * 60 * 1000)) * 100 : -1;

  return (
    <div className="flex flex-col w-full border rounded-md bg-white max-h-[calc(100vh-280px)] shadow-sm overflow-hidden">
      <div className="flex-1 overflow-auto shadow-inner">
        <div className="min-w-max relative">
          {/* Header Row */}
          <div className="flex border-b bg-gray-50 sticky top-0 z-30 shadow-sm">
            <div className="w-64 shrink-0 border-r p-2 font-semibold text-sm flex items-center bg-gray-50 sticky left-0 z-40">
              任务信息
            </div>
            <div className="flex-1 flex relative" style={{ minWidth: `${gridMinWidth}px` }}>
              {headers.map((header, i) => (
                <div
                  key={i}
                  className="border-r p-2 text-center text-[11px] font-medium text-gray-500 whitespace-nowrap flex items-center justify-center"
                  style={{ width: `${(header.colSpan / totalColumns) * 100}%` }}
                >
                  {header.label}
                </div>
              ))}
              
              {/* Current Time Indicator in Header */}
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

          {/* Task Rows */}
          <div className="relative">
            {paginatedGroups.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm bg-white">
                {searchTerm ? "未搜索到匹配的账号或任务。" : "该时间段内没有安排任务。"}
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
                          <span className="truncate" title={group.robotNames?.join(', ')}>{group.robotName}</span>
                          {group.robotNames && group.robotNames.length > 1 && (
                            <div className="hidden group-hover/robot:block absolute left-0 top-full mt-1 p-2 bg-white border rounded shadow-xl z-[100] min-w-[180px] text-gray-700 pointer-events-none">
                              <div className="font-bold text-[11px] mb-1 border-b pb-1 text-blue-700">关联应用 ({group.robotNames.length})</div>
                              <div className="max-h-48 overflow-y-auto">
                                {group.robotNames.map((name, idx) => (
                                  <div key={idx} className="py-1 text-[10px] border-b border-gray-50 last:border-0">{name}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center text-[10px] text-green-600 truncate" title={`机器人/组: ${group.clientName}`}>
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
                        <div className="text-[10px] text-gray-500">
                          任务数量: {group.executions.length}
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex-1 relative" style={{ minHeight: `${Math.max(40, group.totalLanes * 20 + 8)}px`, minWidth: `${gridMinWidth}px` }}>
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {columns.map((_, i) => (
                        <div
                          key={i}
                          className="border-r h-full border-gray-100"
                          style={{ width: `${(1 / totalColumns) * 100}%` }}
                        />
                      ))}
                    </div>
                    
                    {/* Current Time Line in Body */}
                    {isNowVisible && (
                      <div 
                        className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20 pointer-events-none"
                        style={{ left: `${nowLeftPercent}%` }}
                      />
                    )}
                    
                    {/* Task Executions */}
                    {group.executions.map((task) => {
                      const visibleStart = task.startDate < startDate ? startDate : task.startDate;
                      const visibleEnd = task.endDate > endDate ? endDate : task.endDate;

                      const startDiffMs = visibleStart.getTime() - startDate.getTime();
                      const durationMs = visibleEnd.getTime() - visibleStart.getTime();
                      const totalMs = totalMinutes * 60 * 1000;
                      
                      const leftPercent = Math.max(0, (startDiffMs / totalMs) * 100);
                      let widthPercent = Math.min(100 - leftPercent, (durationMs / totalMs) * 100);

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "absolute h-4 rounded-sm shadow-sm flex items-center px-1 text-[9px] text-white truncate transition-all cursor-pointer hover:z-30 hover:ring-2 hover:ring-offset-1 hover:ring-indigo-400",
                            task.status === 'running' && "animate-pulse ring-1 ring-blue-400",
                            task.status === 'pending' ? "opacity-70 border border-dashed border-white/30" : "opacity-100"
                          )}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            top: `${4 + task.lane * 20}px`,
                            minWidth: '3px',
                            backgroundColor: getTaskColor(task)
                          }}
                          title={`${task.name}\n状态: ${{
                            pending: '计划中',
                            running: '运行中',
                            completed: '已完成',
                            failed: '失败'
                          }[task.status]}\n应用: ${task.robotName}\n机器人/组: ${task.clientName}\n开始: ${format(task.startDate, 'yyyy-MM-dd HH:mm:ss')}\n结束: ${format(task.endDate, 'yyyy-MM-dd HH:mm:ss')}`}
                        >
                          {widthPercent > 3 && format(task.startDate, viewMode === 'Day' ? 'HH:mm' : 'MM-dd HH:mm')}
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
      
      {/* Pagination for Task View - Outside the horizontal scroll area */}
      {groupBy === 'task' && groupedTasksWithLanes.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-white z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center text-xs text-gray-500">
            共 {groupedTasksWithLanes.length} 条记录
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">每页显示</span>
              <select
                className="border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 100, 200].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">条</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600">
                {currentPage} / {Math.ceil(groupedTasksWithLanes.length / pageSize)}
              </span>
              <button
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentPage >= Math.ceil(groupedTasksWithLanes.length / pageSize)}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
