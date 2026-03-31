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
      const batchSize = 10; // Reduced batch size to avoid rate limits
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const fetchWithRetry = async (url: string, data: any, maxRetries = 3): Promise<any> => {
        let retries = 0;
        while (retries < maxRetries) {
          try {
            return await axios.post(url, data);
          } catch (e: any) {
            if (e.response?.status === 429 && retries < maxRetries - 1) {
              const waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
              console.warn(`Rate limited (429). Waiting ${Math.round(waitTime)}ms before retry ${retries + 1}...`);
              await delay(waitTime);
              retries++;
              continue;
            }
            throw e;
          }
        }
      };
      
      for (let i = 0; i < activeTasks.length; i += batchSize) {
        const batch = activeTasks.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item) => {
          try {
            const scheduleUuid = item.scheduleUuid || (item as any).uuid || (item as any).id;
            
            const detailPromise = fetchWithRetry('/api/yingdao/schedule/detail', {
              token: accessToken,
              scheduleUuid
            }).catch(e => {
              console.error(`获取任务详情失败 ${scheduleUuid}`, e.message);
              return { data: { data: {} } };
            });

            // Fetch history for average duration
            const historyPromise = fetchWithRetry('/api/yingdao/task/list', {
              token: accessToken,
              payload: {
                sourceUuid: scheduleUuid,
                statusList: ["finish", "success"],
                size: 20, // Reduced history size
                startTime: format(addDays(new Date(), -30), 'yyyy-MM-dd HH:mm:ss'),
                endTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              }
            }).catch(e => {
              console.error(`获取任务历史失败 ${scheduleUuid}`, e.message);
              return { data: { data: { dataList: [] } } };
            });

            const [detailRes, historyRes] = await Promise.all([detailPromise, historyPromise]);
            
            const detailData = detailRes.data?.data || {};
            const historyList = historyRes.data?.data?.dataList || [];
            
            let totalDuration = 0;
            let validCount = 0;
            
            historyList.forEach((record: any) => {
              if (record.createTime && record.updateTime) {
                const start = parseISO(record.createTime.replace(' ', 'T'));
                const end = parseISO(record.updateTime.replace(' ', 'T'));
                if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                  totalDuration += (end.getTime() - start.getTime());
                  validCount++;
                }
              }
            });
            
            const averageDurationMins = validCount > 0 ? Math.max(1, Math.round(totalDuration / validCount / 60000)) : 1;

            return { 
              ...item, 
              ...detailData,
              cronInterface: detailData.cronInterface || item.cronInterface,
              averageDurationMins
            };
          } catch (e) {
            console.error(`处理任务失败`, e);
            return { ...item, averageDurationMins: 1 }; // Fallback to list item if detail fails
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        details.push(...batchResults);
        
        // Add a small delay between batches to be safe
        if (i + batchSize < activeTasks.length) {
          await delay(500);
        }
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
    const startDateGen = startOfDay(subDays(now, 1)); // Start from yesterday to cover today's past tasks
    const endDate = addDays(now, 30); // Generate for next 30 days
    
    items.forEach(item => {
      let cronIf = item.cronInterface;
      if (typeof cronIf === 'string') {
        try { cronIf = JSON.parse(cronIf); } catch (e) {}
      }
      
      // Permissive check: if no cronInterface but has nextTime at the root level
      const rootNextTime = (item as any).nextTime || (item as any).nextRunTime;
      if (!cronIf && !rootNextTime) return;
      
      const robotNames = item.robotList?.map(r => r.robotName) || [(item as any).appName || (item as any).robotName || '未知应用'];
      const robotName = robotNames[0];
      
      let clientName = '未知机器人/组';
      if (item.robotClientList && item.robotClientList.length > 0) {
        clientName = item.robotClientList[0].robotClientName || clientName;
      } else if (item.robotClientGroup && item.robotClientGroup.name) {
        clientName = item.robotClientGroup.name;
      } else if (item.robotClientGroupList && item.robotClientGroupList.length > 0) {
        clientName = item.robotClientGroupList[0].robotClientGroupName || item.robotClientGroupList[0].name || clientName;
      } else if (item.robotGroupList && item.robotGroupList.length > 0) {
        clientName = item.robotGroupList[0].robotGroupName || item.robotGroupList[0].name || clientName;
      } else if ((item as any).clientGroupName) {
        clientName = (item as any).clientGroupName;
      } else if ((item as any).robotGroupName) {
        clientName = (item as any).robotGroupName;
      } else if ((item as any).clientName) {
        clientName = (item as any).clientName;
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
          while (nextDate < endDate && count < 1000) { // Increased limit to 1000 executions per task
            const durationMins = item.averageDurationMins || 1; // Default 1 min or average
            const taskEndDate = new Date(nextDate.getTime() + durationMins * 60000);
            
            console.log(`[TaskDebug] Task: ${item.scheduleName}, Cron: ${cronExpr}, Next: ${nextDate.toISOString()}`);
            
            newTasks.push({
              id: `${item.scheduleUuid}-${count}`,
              name: item.scheduleName || (item as any).name || '未命名任务',
              startDate: nextDate,
              endDate: taskEndDate,
              status: 'pending',
              robotName,
              robotNames,
              clientName
            });
            
            nextDate = interval.next().toDate();
            count++;
          }
        } else {
          // Fallback to nextTime if cron parsing fails or is manual
          const nextTimeStr = cronIf?.nextTime || rootNextTime;
          if (nextTimeStr) {
            const nextDate = parseISO(nextTimeStr.replace(' ', 'T'));
            if (!isNaN(nextDate.getTime())) {
              newTasks.push({
                id: `${item.scheduleUuid}-0`,
                name: item.scheduleName || (item as any).name || '未命名任务',
                startDate: nextDate,
                endDate: new Date(nextDate.getTime() + (item.averageDurationMins || 1) * 60000),
                status: 'pending',
                robotName,
                robotNames,
                clientName
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
    const lower = searchTerm.toLowerCase();
    return tasks.filter(t => 
      t.name.toLowerCase().includes(lower) || 
      (t.robotName && t.robotName.toLowerCase().includes(lower)) ||
      (t.clientName && t.clientName.toLowerCase().includes(lower))
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
                />
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                <p className="mb-4">该时间段内没有安排任务，或任务解析失败。</p>
                {(schedules.length > 0 || rawResponse) && (
                  <div className="text-left bg-gray-100 p-4 rounded-md overflow-auto max-h-96 text-xs font-mono">
                    <p className="font-bold mb-2">调试信息 (获取到的原始任务数据):</p>
                    <pre>{JSON.stringify(rawResponse || schedules, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

