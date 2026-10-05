import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Organizer } from './Organizer';
import { organizationSummary } from './organizationSummary';
import type { OrganizationPlan } from '../platform/desktop';
const plan = (statuses: string[]): OrganizationPlan => ({ id: 'test', started: true, finished: true, journalPath: null, notice: '', entries: statuses.map((status, i) => ({ operationId: String(i), imageIds: [String(i)], name: `${i}.png`, group: '入选', action: 'move', source: 'source', target: 'target', status, note: '' })) });
describe('organizer completion and optional preview', () => {
  const render = (p: OrganizationPlan | null) => renderToStaticMarkup(<Organizer vetoedCount={0} selectedIds={['1']} rejectedIds={['2']} plan={p} onPlan={() => {}} onExecuted={() => {}} onActivity={() => {}} onClose={() => {}} />);
  it('makes detailed preview opt-in with no forced preview-only primary action', () => {
    const html = render(null);
    expect(html).toContain('执行前展开逐文件预览（可选）'); expect(html).not.toContain('checked=""');
    expect(html).toContain('移动这 0 张'); expect(html).not.toContain('>预览文件去向</button>');
  });
  it('successful moves offer an explicit completion button, never retry zero', () => {
    const p = plan(['moved','moved','kept','noop']);
    expect(organizationSummary(p).success).toBe(true); const html = render(p);
    expect(html).toContain('已移动 2 张，全部完成。'); expect(html).toContain('完成，返回结果'); expect(html).not.toContain('重试未完成项');
  });
  it('does not misrepresent failed, skipped, stopped, uncertain or pending operations as success', () => {
    for (const status of ['failed','skipped','cancelled','copied','review','ready']) {
      const p = plan(['moved',status]); expect(organizationSummary(p).success).toBe(false);
      expect(render(p)).not.toContain('全部完成');
    }
    expect(render(plan(['moved','failed','cancelled','copied']))).toContain('重试未完成项（2）');
    expect(organizationSummary({ ...plan(['moved']), finished: false }).success).toBe(false);
  });
});
