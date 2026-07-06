import { describe, expect, it } from 'vitest';

import { buildTaskIdentity, getQueueTaskIdentity } from './taskIdentity';

describe('task identity helpers', () => {
  it('normalizes comparable task identity parts', () => {
    const identity = buildTaskIdentity({
      sourceType: 'future',
      scheduleUuid: ' Schedule-1 ',
      taskUuid: 'Run-1',
      accountName: 'Admin@Qingmu',
      taskName: '  Daily Import  ',
      startTime: '2026-05-27 16:00:00',
      status: 'Pending',
    });

    expect(identity).toBe('future|schedule-1|run-1|admin@qingmu|daily import|2026-05-27 16:00:00|pending');
  });

  it('builds queue identities from task and scope names', () => {
    const identity = getQueueTaskIdentity(
      {
        taskUuid: 'task-1',
        taskName: '导入订单',
        scheduleUuid: 'schedule-1',
        scheduleName: '定时导入',
        status: 'queued',
        updatedAt: '2026-05-27 16:00:00',
      },
      ['lvming@qingmu', 'admin@qingmu'],
    );

    expect(identity).toContain('queue|schedule-1|task-1|lvming@qingmu|admin@qingmu');
    expect(identity.endsWith('|queued')).toBe(true);
  });
});
