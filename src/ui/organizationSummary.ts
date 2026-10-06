import { t } from '../i18n';
import type { OrganizationPlan } from '../platform/desktop';

export function organizationSummary(plan: OrganizationPlan) {
  const count = (status: string) => plan.entries.filter(e => e.status === status).length;
  const moved = count('moved'), recycled = count('recycled');
  const attention = plan.entries.filter(e => ['failed', 'cancelled', 'copied', 'review', 'skipped'].includes(e.status)).length;
  const remaining = count('ready');
  const success = plan.started && plan.finished && attention === 0 && remaining === 0;
  return { moved, recycled, attention, success,
    text: success ? t("已移动 {0} 张{1}，全部完成。", [moved, recycled ? t("，已回收 {0} 张", [recycled]) : ''])
      : plan.started ? t("已移动 {0} 张 · 已回收 {1} 张{2}", [moved, recycled, attention ? t(" · {0} 项需查看", [attention]) : t(" · 正在处理")])
      : remaining ? t("{0} 项待执行{1}", [remaining, attention ? t("，{0} 项需查看", [attention]) : '']) : t("没有需要执行的文件，请查看保留或跳过原因。"),
  };
}
