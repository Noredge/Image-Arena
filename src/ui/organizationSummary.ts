import type { OrganizationPlan } from '../platform/desktop';

export function organizationSummary(plan: OrganizationPlan) {
  const count = (status: string) => plan.entries.filter(e => e.status === status).length;
  const moved = count('moved'), recycled = count('recycled');
  const attention = plan.entries.filter(e => ['failed', 'cancelled', 'copied', 'review', 'skipped'].includes(e.status)).length;
  const remaining = count('ready');
  const success = plan.started && plan.finished && attention === 0 && remaining === 0;
  return { moved, recycled, attention, success,
    text: success ? `已移动 ${moved} 张${recycled ? `，已回收 ${recycled} 张` : ''}，全部完成。`
      : plan.started ? `已移动 ${moved} 张 · 已回收 ${recycled} 张${attention ? ` · ${attention} 项需查看` : ' · 正在处理'}`
      : remaining ? `${remaining} 项待执行${attention ? `，${attention} 项需查看` : ''}` : '没有需要执行的文件，请查看保留或跳过原因。',
  };
}
