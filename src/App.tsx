import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears, startOfWeek, endOfWeek, parseISO, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import CronExpressionParser from 'cron-parser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChart, ViewMode, ScheduleTask } from '@/components/GanttChart';
import { Loader2, Calendar as CalendarIcon, KeyRound, RefreshCw, Bot, AppWindow, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CronInterface {
  type: string;
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
  enabled: boolean;
  cronInterface?: CronInterface;
}

interface RobotInfo {
  robotUuid: string;
  robotName: string;
}

interface RobotClientInfo {
  uuid: string;
  robotClientName: string;
  statusName: string;
}

interface RobotClientGroupInfo {
  uuid?: string;
  robotClientGroupName?: string;
  name?: string;
}

interface ScheduleDetail extends ScheduleItem {
  robotList?: RobotInfo[];
  robotClientList?: RobotClientInfo[];
  robotClientGroupList?: RobotClientGroupInfo[];
  robotGroupList?: any[];
  robotClientGroup?: {
    uuid?: string;
    name?: string;
  };
  averageDurationMins?: number;
  historicalRuns?: any[];
}

interface RobotClient {
  robotClientUuid: string;
  robotClientName: string;
  status: string;
  windowsUserName: string;
  clientIp: string;
  machineName: string;
  clientVersion: string;
  createTime: string;
}

interface RobotGroup {
  uuid: string;
  name: string;
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

function getCronExpression(cronIf: CronInterface): string | null {
  if (cronIf.cronExpress) return cronIf.cronExpress;
  
  // Helper to parse time string "HH:mm" or "HH:mm:ss"
  const parseTime = (timeStr?: string) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      return {
        h: parseInt(parts[0]),
        m: parseInt(parts[1])
      };
    }
    return null;
  };

  if (cronIf.type === 'minute') {
    const m = parseInt(cronIf.minute as any) || 1;
    return `*/${m} * * * *`;
  }
  if (cronIf.type === 'hour') {
    const m = parseInt(cronIf.minute as any) || 0;
    return `${m} * * * *`;
  }
  if (cronIf.type === 'day') {
    let m = parseInt(cronIf.minute as any) || 0;
    let h = parseInt(cronIf.hour as any) || 0;
    
    const timeInfo = parseTime(cronIf.time);
    if (timeInfo) {
      h = timeInfo.h;
      m = timeInfo.m;
    }
    
    return `${m} ${h} * * *`;
  }
  if (cronIf.type === 'week') {
    let m = parseInt(cronIf.minute as any) || 0;
    let h = parseInt(cronIf.hour as any) || 0;
    
    const timeInfo = parseTime(cronIf.time);
    if (timeInfo) {
      h = timeInfo.h;
      m = timeInfo.m;
    }
    
    // API uses 1-7 for Sun-Sat (1=Sun, 2=Mon, 3=Tue, ..., 7=Sat)
    // cron-parser uses 0-6 for Sun-Sat (0=Sun, 1=Mon, 2=Tue, ..., 6=Sat)
    const dows = cronIf.dayOfWeeks && cronIf.dayOfWeeks.length > 0 
      ? cronIf.dayOfWeeks.map(d => (parseInt(d as any) - 1 + 7) % 7).join(',') 
      : '*';
    const expr = `${m} ${h} * * ${dows}`;
    console.log(`[CronDebug] type: week, dows: ${cronIf.dayOfWeeks}, generated: ${expr}`);
    return expr;
  }
  if (cronIf.type === 'month') {
    let m = parseInt(cronIf.minute as any) || 0;
    let h = parseInt(cronIf.hour as any) || 0;
    
    const timeInfo = parseTime(cronIf.time);
    if (timeInfo) {
      h = timeInfo.h;
      m = timeInfo.m;
    }
    
    const dom = parseInt(cronIf.month as any) || 1; 
    const expr = `${m} ${h} ${dom} * *`;
    console.log(`[CronDebug] type: month, dom: ${dom}, generated: ${expr}`);
    return expr;
  }
  return null;
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
  
  const [viewMode, setViewMode] = useState<ViewMode>('Week');
  const [groupBy, setGroupBy] = useState<'task' | 'robot'>('task');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const savedId = localStorage.getItem('yingdao_ak_id');
    const savedSecret = localStorage.getItem('yingdao_ak_secret');
    if (savedId) setAccessKeyId(savedId);
    if (savedSecret) setAccessKeySecret(savedSecret);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKeyId || !accessKeySecret) {
      setError('请输入 Access Key ID 和 Secret');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const tokenRes = await axios.post('/api/yingdao/token', {
        accessKeyId,
        accessKeySecret
      });
      
      const accessToken = tokenRes.data?.data?.accessToken || tokenRes.data?.data?.token || tokenRes.data?.accessToken || tokenRes.data?.token;
      
      if (!accessToken) {
        throw new Error('无法从响应中解析 Token');
      }
      
      setToken(accessToken);
      localStorage.setItem('yingdao_ak_id', accessKeyId);
      localStorage.setItem('yingdao_ak_secret', accessKeySecret);
      
      await Promise.all([
        fetchSchedules(accessToken),
        fetchRobotClients(accessToken),
        fetchRobotGroups(accessToken)
      ]);
      
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || '认证失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRobotClients = async (accessToken: string) => {
    try {
      let allClients: RobotClient[] = [];
      let page = 1;
      const size = 500;
      let hasMore = true;

      while (hasMore && page <= 10) {
        const res = await axios.post('/api/yingdao/client/list', {
          token: accessToken,
          payload: { page, size }
        });
        
        const list = res.data?.data;
        if (!Array.isArray(list) || list.length === 0) {
          hasMore = false;
        } else {
          allClients = [...allClients, ...list];
          if (list.length < size) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }
      setRobotClients(allClients);
    } catch (e) {
      console.error('获取机器人列表失败', e);
    }
  };

  const fetchRobotGroups = async (accessToken: string) => {
    try {
      let allGroups: RobotGroup[] = [];
      let page = 1;
      const size = 500;
      let hasMore = true;

      while (hasMore && page <= 10) {
        const res = await axios.post('/api/yingdao/client/group/list', {
          token: accessToken,
          payload: { page, size }
        });
        
        const list = res.data?.data;
        if (!Array.isArray(list) || list.length === 0) {
          hasMore = false;
        } else {
          const mappedList = list.map((item: any) => ({
            uuid: item.robotClientGroupUuid || item.uuid,
            name: item.robotClientGroupName || item.name
          }));
          allGroups = [...allGroups, ...mappedList];
          if (list.length < size) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }
      setRobotGroups(allGroups);
    } catch (e) {
      console.error('获取机器人分组列表失败', e);
    }
  };

  const fetchSchedules = async (accessToken: string) => {
    setLoading(true);
    try {
      let allList: ScheduleItem[] = [];
      let page = 1;
      const size = 500; // Max size according to docs
      let hasMore = true;
      let firstPageRaw = null;

      while (hasMore && page <= 10) { // 10 pages * 500 = 5000 tasks
        const listRes = await axios.post('/api/yingdao/schedule/list', {
          token: accessToken,
          payload: { page, size }
        });
        
        if (page === 1) {
          firstPageRaw = listRes.data;
          setRawResponse(firstPageRaw);
        }
        
        let list: ScheduleItem[] = [];
        if (Array.isArray(listRes.data?.data)) {
          list = listRes.data.data;
        } else if (Array.isArray(listRes.data?.data?.data)) {
          list = listRes.data.data.data;
        } else if (Array.isArray(listRes.data?.data?.list)) {
          list = listRes.data.data.list;
        } else if (Array.isArray(listRes.data?.data?.records)) {
          list = listRes.data.data.records;
        } else if (Array.isArray(listRes.data?.list)) {
          list = listRes.data.list;
        } else if (Array.isArray(listRes.data?.records)) {
          list = listRes.data.records;
        } else if (Array.isArray(listRes.data)) {
          list = listRes.data;
        }
        
        if (!Array.isArray(list) || list.length === 0) {
          hasMore = false;
          // Fallback for page 1 if payload with page/size fails
          if (page === 1) {
            const fallbackRes = await axios.post('/api/yingdao/schedule/list', {
              token: accessToken,
              payload: {}
            });
            let fallbackList: ScheduleItem[] = [];
            const fd = fallbackRes.data;
            if (Array.isArray(fd?.data)) fallbackList = fd.data;
            else if (Array.isArray(fd?.data?.data)) fallbackList = fd.data.data;
            else if (Array.isArray(fd?.data?.list)) fallbackList = fd.data.list;
            else if (Array.isArray(fd?.data?.records)) fallbackList = fd.data.records;
            else if (Array.isArray(fd?.list)) fallbackList = fd.list;
            else if (Array.isArray(fd?.records)) fallbackList = fd.records;
            else if (Array.isArray(fd)) fallbackList = fd;
            
            if (Array.isArray(fallbackList) && fallbackList.length > 0) {
              allList = fallbackList;
            } else {
              console.warn('任务列表为空或格式无效', fallbackRes.data);
            }
          }
        } else {
          allList = [...allList, ...list];
          if (list.length < size) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      // We need to fetch details for each enabled period task to get robot info
      // 移除 scheduleType !== 'manual' 的限制，因为有些周期任务可能被标记为 manual
      const activeTasks = allList.filter(item => {
        // Permissive enabled check
        if (item.enabled === false || (item as any).enabled === 'false' || (item as any).status === 0) return false;
        return true;
      });
      
      const details: ScheduleDetail[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Task details cache to avoid repeated task/query calls
      const getTaskDetailsCache = () => {
        try {
          const cached = localStorage.getItem('yingdao_task_details');
          return cached ? JSON.parse(cached) : {};
        } catch (e) { return {}; }
      };
      const saveTaskDetailsToCache = (uuid: string, data: any) => {
        try {
          const cache = getTaskDetailsCache();
          cache[uuid] = data;
          // Prune cache if it gets too large
          const keys = Object.keys(cache);
          if (keys.length > 1000) {
             const keysToRemove = keys.slice(0, keys.length - 1000);
             keysToRemove.forEach(k => delete cache[k]);
          }
          localStorage.setItem('yingdao_task_details', JSON.stringify(cache));
        } catch (e) {}
      };

      const taskDetailsCache = getTaskDetailsCache();

      const fetchWithRetry = async (url: string, data: any, maxRetries = 5): Promise<any> => {
        let retries = 0;
        while (retries < maxRetries) {
          try {
            const res = await axios.post(url, data);
            if (res.data?.code === 429) {
              throw { response: { status: 429, data: res.data } };
            }
            return res;
          } catch (e: any) {
            const isRateLimit = e.response?.status === 429 || e.data?.code === 429 || e.response?.data?.code === 429;
            if (isRateLimit && retries < maxRetries - 1) {
              const waitTime = Math.pow(2, retries + 1) * 1000 + Math.random() * 1000;
              console.warn(`Rate limited (429) on ${url}. Waiting ${Math.round(waitTime)}ms before retry ${retries + 1}...`);
              await delay(waitTime);
              retries++;
              continue;
            }
            throw e;
          }
        }
      };

      // Process tasks with a concurrency limit
      const limit = 3;
      
      console.log(`Processing ${activeTasks.length} active schedules...`);

      const processSchedule = async (item: ScheduleItem) => {
        const scheduleUuid = item.scheduleUuid || (item as any).uuid || (item as any).id;
        if (!scheduleUuid) return;

        let historicalRuns: any[] = [];
        let avgMins = 1;

        try {
          // Fetch history to calculate duration and show past 24h runs
          let dataList: any[] = [];
          let hasNext = true;
          let nextId: any = undefined;
          let page = 1;
          
          while (hasNext && dataList.length < 30 && page <= 3) {
            const listRes = await fetchWithRetry('/api/yingdao/task/list', {
              token: accessToken,
              payload: { sourceUuid: scheduleUuid, size: 20, cursorDirection: 'next', nextId, page }
            });
            
            const td = listRes.data?.data;
            let currentList: any[] = [];
            if (Array.isArray(td)) currentList = td;
            else if (Array.isArray(td?.dataList)) currentList = td.dataList;
            else if (Array.isArray(td?.data)) currentList = td.data;
            
            if (currentList.length === 0) break;
            dataList = dataList.concat(currentList);
            
            if (td?.hasData === false || (td?.page && td.page.page >= td.page.pages)) {
              hasNext = false;
            } else {
              nextId = td?.nextId;
              page++;
            }
            await delay(100);
          }
          
          let totalDuration = 0;
          let validCount = 0;
          const seenTaskUuids = new Set<string>();

          const parseDate = (dateVal: any) => {
            if (!dateVal) return new Date(NaN);
            if (typeof dateVal === 'number') {
              return new Date(dateVal > 9999999999 ? dateVal : dateVal * 1000);
            }
            if (typeof dateVal === 'string') {
              return new Date(dateVal.replace(' ', 'T'));
            }
            return new Date(dateVal);
          };

          for (const taskRecord of dataList) {
            const taskUuid = String(taskRecord.taskUuid || taskRecord.uuid);
            if (!taskUuid || seenTaskUuids.has(taskUuid)) continue;
            seenTaskUuids.add(taskUuid);

            let taskData = taskRecord;
            
            // Check cache first
            if (taskDetailsCache[taskUuid]) {
               taskData = { ...taskData, ...taskDetailsCache[taskUuid] };
            } else if (!taskData.startTime) {
              const queryRes = await fetchWithRetry('/api/yingdao/task/query', {
                token: accessToken,
                taskUuid
              });
              const queryData = queryRes.data?.data || queryRes.data;
              if (queryData && queryData.startTime) {
                 taskData = { ...taskData, startTime: queryData.startTime, endTime: queryData.endTime, status: queryData.status || queryData.statusName || taskData.status };
                 // Save to cache if it has an end time (finished)
                 if (queryData.endTime) {
                   saveTaskDetailsToCache(taskUuid, { startTime: queryData.startTime, endTime: queryData.endTime, status: taskData.status });
                 }
              }
              await delay(200);
            }

            if (taskData.startTime) {
              const start = parseDate(taskData.startTime);
              let end = new Date();
              let hasValidEnd = false;
              
              if (taskData.endTime) {
                end = parseDate(taskData.endTime);
                hasValidEnd = !isNaN(end.getTime()) && end > start;
              } else {
                // For running tasks, estimate end time or use current time
                end = new Date(Math.max(Date.now(), start.getTime() + 60000));
              }
              
              if (!isNaN(start.getTime())) {
                const isFinished = taskData.status === 'finish' || taskData.statusName === '完成' || taskData.status === 'success';
                if (isFinished && hasValidEnd) {
                  totalDuration += (end.getTime() - start.getTime());
                  validCount++;
                }
                
                // Add to historical runs if within last 24 hours
                const now = new Date();
                const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                if (start >= twentyFourHoursAgo || end >= twentyFourHoursAgo) {
                   historicalRuns.push({
                     id: taskUuid,
                     start,
                     end,
                     status: taskData.status || taskData.statusName || 'unknown'
                   });
                }
              }
            }
          }

          avgMins = validCount > 0 ? Math.max(1, Math.round(totalDuration / validCount / 60000)) : 1;
          await delay(300);
        } catch (e) {
          console.error(`Failed to fetch history for ${scheduleUuid}`, e);
        }

        // 2. Fetch details if needed
        try {
          let detailData: any = {};
          const hasCron = !!item.cronInterface;
          const hasRobotDetails = !!((item as any).robotClientList || (item as any).robotClientGroupList || (item as any).robotGroupList || (item as any).robotClientGroup);
          
          if (!hasCron || !hasRobotDetails) {
            const detailRes = await fetchWithRetry('/api/yingdao/schedule/detail', {
              token: accessToken,
              scheduleUuid
            });
            detailData = detailRes.data?.data || {};
            await delay(300);
          }

          details.push({ 
            ...item, 
            ...detailData,
            cronInterface: detailData.cronInterface || item.cronInterface,
            averageDurationMins: avgMins,
            historicalRuns
          });
        } catch (e) {
          details.push({ ...item, averageDurationMins: avgMins, historicalRuns } as any);
        }
      };

      // Run with concurrency limit
      for (let i = 0; i < activeTasks.length; i += limit) {
        const batch = activeTasks.slice(i, i + limit);
        await Promise.all(batch.map(processSchedule));
        if (i + limit < activeTasks.length) await delay(500);
      }
      
      setSchedules(details);
      generateTasks(details);
      
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || '获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const generateTasks = (items: ScheduleDetail[]) => {
    const newTasks: ExtendedScheduleTask[] = [];
    const now = new Date();
    // 核心是知道将来有计划的任务的情况，所以从当前时间开始生成
    const startDateGen = now; 
    const endDate = addDays(now, 30); // 生成未来30天的计划
    
    items.forEach(item => {
      // 过滤掉没规律的手动运行任务
      if (item.scheduleType === 'manual' && !item.cronInterface) return;

      let cronIf = item.cronInterface;
      if (typeof cronIf === 'string') {
        try { cronIf = JSON.parse(cronIf); } catch (e) {}
      }
      
      // 如果没有 cron 接口且没有下一次运行时间，并且没有历史记录，则跳过
      const rootNextTime = (item as any).nextTime || (item as any).nextRunTime;
      const hasHistory = item.historicalRuns && item.historicalRuns.length > 0;
      if (!cronIf && !rootNextTime && !hasHistory) return;
      
      const robotNames = item.robotList?.map(r => r.robotName) || [(item as any).appName || (item as any).robotName || '未知应用'];
      const robotName = robotNames[0];
      
      const clientNames: string[] = [];
      if (item.robotClientList && item.robotClientList.length > 0) {
        item.robotClientList.forEach(c => {
          if (c.robotClientName) clientNames.push(c.robotClientName);
          if ((c as any).windowsUserName) clientNames.push((c as any).windowsUserName);
        });
      }
      if (item.robotClientGroup && item.robotClientGroup.name) {
        clientNames.push(item.robotClientGroup.name);
      }
      if (item.robotClientGroupList && item.robotClientGroupList.length > 0) {
        item.robotClientGroupList.forEach(g => {
          if (g.robotClientGroupName) clientNames.push(g.robotClientGroupName);
          else if (g.name) clientNames.push(g.name);
        });
      }
      if (item.robotGroupList && item.robotGroupList.length > 0) {
        item.robotGroupList.forEach(g => {
          if (g.robotGroupName) clientNames.push(g.robotGroupName);
          else if (g.name) clientNames.push(g.name);
        });
      }
      if ((item as any).clientGroupName) clientNames.push((item as any).clientGroupName);
      if ((item as any).robotGroupName) clientNames.push((item as any).robotGroupName);
      if ((item as any).clientName) clientNames.push((item as any).clientName);
      if ((item as any).creatorName) clientNames.push((item as any).creatorName);
      if ((item as any).ownerName) clientNames.push((item as any).ownerName);
      if ((item as any).userName) clientNames.push((item as any).userName);
      if ((item as any).accountName) clientNames.push((item as any).accountName);
      if ((item as any).creatorEmail) clientNames.push((item as any).creatorEmail);
      
      const clientName = clientNames.length > 0 ? clientNames[0] : '未知机器人/组';

      // Add historical runs
      if (hasHistory) {
         item.historicalRuns.forEach((run: any) => {
            let status = 'completed';
            if (run.status === 'fail' || run.status === 'error' || run.statusName === '失败') status = 'failed';
            else if (run.status === 'running' || run.statusName === '运行中') status = 'running';

            newTasks.push({
              id: `hist-${item.scheduleUuid || (item as any).uuid || (item as any).id}-${run.id}`,
              name: item.scheduleName || (item as any).name || '未命名任务',
              startDate: run.start,
              endDate: run.end,
              status: status as any,
              robotName,
              robotNames,
              clientName,
              clientNames,
              scheduleUuid: item.scheduleUuid || (item as any).uuid || (item as any).id,
              cronExpr: null,
              isHistorical: true
            });
         });
      }
      
      try {
        let cronExpr = null;
        if (cronIf) {
          cronExpr = getCronExpression(cronIf);
        }
        
        if (cronExpr) {
          const interval = CronExpressionParser.parse(cronExpr, { currentDate: startDateGen });
          let nextDate = interval.next().toDate();
          
          let count = 0;
          while (nextDate < endDate && count < 1000) {
            const durationMins = item.averageDurationMins || 1;
            const taskEndDate = new Date(nextDate.getTime() + durationMins * 60000);
            
            newTasks.push({
              id: `${item.scheduleUuid}-${count}`,
              name: item.scheduleName || (item as any).name || '未命名任务',
              startDate: nextDate,
              endDate: taskEndDate,
              status: 'pending',
              robotName,
              robotNames,
              clientName,
              clientNames
            });
            
            nextDate = interval.next().toDate();
            count++;
          }
        } else {
          // 仅当有明确的下一次运行时间时才添加
          const nextTimeStr = cronIf?.nextTime || rootNextTime;
          if (nextTimeStr) {
            const nextDate = parseISO(nextTimeStr.replace(' ', 'T'));
            if (!isNaN(nextDate.getTime()) && nextDate >= now) {
              newTasks.push({
                id: `${item.scheduleUuid}-0`,
                name: item.scheduleName || (item as any).name || '未命名任务',
                startDate: nextDate,
                endDate: new Date(nextDate.getTime() + (item.averageDurationMins || 1) * 60000),
                status: 'pending',
                robotName,
                robotNames,
                clientName,
                clientNames
              });
            }
          }
        }
      } catch (e) {
        console.warn(`无法解析任务时间 ${item.scheduleName}`, e);
      }
    });
    
    newTasks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setTasks(newTasks);
  };

  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;
    const lower = searchTerm.trim().toLowerCase();
    return tasks.filter(t => 
      t.name.toLowerCase().includes(lower) || 
      t.id.toLowerCase().includes(lower) ||
      (t.robotNames && t.robotNames.some(rn => rn.toLowerCase().includes(lower))) ||
      (t.clientNames && t.clientNames.some(cn => cn.toLowerCase().includes(lower)))
    );
  }, [tasks, searchTerm]);

  const handlePrevPeriod = () => {
    switch (viewMode) {
      case 'Day': setCurrentDate(prev => subDays(prev, 1)); break;
      case 'Week': setCurrentDate(prev => subWeeks(prev, 1)); break;
      case 'Month': setCurrentDate(prev => subMonths(prev, 1)); break;
      case 'Year': setCurrentDate(prev => subYears(prev, 1)); break;
    }
  };

  const handleNextPeriod = () => {
    switch (viewMode) {
      case 'Day': setCurrentDate(prev => addDays(prev, 1)); break;
      case 'Week': setCurrentDate(prev => addWeeks(prev, 1)); break;
      case 'Month': setCurrentDate(prev => addMonths(prev, 1)); break;
      case 'Year': setCurrentDate(prev => addYears(prev, 1)); break;
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const currentPeriodLabel = useMemo(() => {
    switch (viewMode) {
      case 'Day':
        return format(currentDate, 'yyyy年M月d日', { locale: zhCN });
      case 'Week': {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(start, 'yyyy年M月d日', { locale: zhCN })} - ${format(end, 'M月d日', { locale: zhCN })}`;
      }
      case 'Month':
        return format(currentDate, 'yyyy年M月', { locale: zhCN });
      case 'Year':
        return format(currentDate, 'yyyy年', { locale: zhCN });
      default:
        return '';
    }
  }, [viewMode, currentDate]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">影刀未来计划看板</CardTitle>
            <CardDescription>
              请输入您的影刀 API 凭证以查看未来的任务计划。
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
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessKeySecret">Access Key Secret</Label>
                <Input 
                  id="accessKeySecret" 
                  type="password"
                  placeholder="请输入您的 Secret" 
                  value={accessKeySecret}
                  onChange={(e) => setAccessKeySecret(e.target.value)}
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
                    认证中...
                  </>
                ) : (
                  '连接并查看看板'
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
            <p className="text-gray-500 mt-1">查看和管理您即将执行的影刀任务</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => {
              fetchSchedules(token);
              fetchRobotClients(token);
              fetchRobotGroups(token);
            }} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              刷新
            </Button>
            <Button variant="ghost" onClick={() => {
              setToken('');
              setSchedules([]);
              setTasks([]);
              setRobotClients([]);
              setRobotGroups([]);
            }}>
              退出登录
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-500 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}

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
                    <Button variant="ghost" onClick={handleToday} className="h-8 px-3 text-sm font-medium">
                      今天
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNextPeriod} className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
                    {currentPeriodLabel}
                  </span>
                </div>
                <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as 'task' | 'robot')} className="w-full sm:w-[200px]">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="task">按任务</TabsTrigger>
                    <TabsTrigger value="robot">按账号</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Input 
                  placeholder="搜索任务、应用或机器人..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full sm:w-[300px]">
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
                <p>正在从影刀 API 加载计划数据...</p>
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
                    <p className="text-lg font-medium text-gray-900">未搜索到匹配结果</p>
                    <p className="mt-1">请尝试更换搜索关键词，如任务名、应用名或机器人账号</p>
                    <Button variant="link" onClick={() => setSearchTerm('')} className="mt-2">
                      清除搜索
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="mb-4">该时间段内没有安排任务，或任务解析失败。</p>
                    {(schedules.length > 0 || rawResponse) && (
                      <div className="text-left bg-gray-100 p-4 rounded-md overflow-auto max-h-96 text-xs font-mono">
                        <p className="font-bold mb-2">调试信息 (获取到的原始任务数据):</p>
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

