import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayCatalog } from './catalog-overlay.mjs';

const input = () => ({
  publishedExams: { exams: [{ slug: '기존', name: '옛 이름', groupId: 'g1', tier: 'T1', fee: { items: [{ label: '응시료', amount: 1 }], checkedAt: '2026-01-01' } }], categories: [], links: {} },
  publishedGroups: { year: 2026, groups: [{ id: 'g1', name: '기존 그룹', sessionCount: 1 }] },
  publishedSessions: { year: 2026, sessions: [{ id: 'g1-1', groupId: 'g1', year: 2026, status: 'confirmed', events: [], src: 'official' }] },
  publishedMeta: { year: 2026, fetchedAt: '2026-01-02T00:00:00.000Z', sources: { official: { health: 'ok' } } },
  examSeed: { exams: [
    { slug: '기존', name: '새 이름', groupId: 'g1', tier: 'T1' },
    { slug: '신규', name: '신규', groupId: 'g2', tier: 'T1', collect: 'manual' },
  ], categories: [{ id: 'c' }], links: { official: true } },
  groupSeed: { groups: [
    { id: 'g1', name: '기존 그룹', cadence: 'periodic' },
    { id: 'g2', name: '신규 그룹', cadence: 'periodic' },
  ] },
  feeSeed: { fees: [
    { slug: '기존', items: [{ label: '응시료', amount: 2 }], checkedAt: '2026-02-01' },
    { slug: '신규', items: [{ label: '응시료', amountLabel: '공식 접수처 확인' }], checkedAt: '2026-02-01' },
  ] },
});

test('승인 카탈로그와 일정 미공고 회차를 수집 기준본 위에 결합한다', () => {
  const result = overlayCatalog(input());
  assert.equal(result.exams.exams.length, 2);
  assert.equal(result.exams.exams[0].name, '새 이름');
  assert.equal(result.exams.exams[0].fee.items[0].amount, 2);
  assert.equal(result.exams.exams[1].fee.items[0].amountLabel, '공식 접수처 확인');
  assert.equal(result.sessions.sessions.filter(session => session.src === 'catalog-placeholders').length, 1);
  assert.equal(result.meta.examCount, 2);
  assert.equal(result.meta.sessionCount, 2);
  assert.equal(result.meta.fetchedAt, '2026-01-02T00:00:00.000Z');
});

test('실제 일정이 들어온 그룹에는 미공고 회차를 중복 생성하지 않는다', () => {
  const value = input();
  value.publishedSessions.sessions.push({ id: 'g2-1', groupId: 'g2', year: 2026, status: 'confirmed', events: [], src: 'new-source' });
  const result = overlayCatalog(value);
  assert.equal(result.sessions.sessions.some(session => session.src === 'catalog-placeholders'), false);
  assert.equal(result.meta.sources['catalog-placeholders'], undefined);
});

test('수집 응시료가 더 최신이면 오래된 수기 값으로 되돌리지 않는다', () => {
  const value = input();
  value.publishedExams.exams[0].fee = { items: [{ label: '응시료', amount: 3 }], checkedAt: '2026-03-01' };
  const result = overlayCatalog(value);
  assert.equal(result.exams.exams[0].fee.items[0].amount, 3);
});

test('같은 날 수집된 금액도 시드보다 우선한다', () => {
  const value = input();
  value.publishedExams.exams[0].fee = { items: [{ label: '응시료', amount: 4 }], checkedAt: '2026-02-01' };
  const result = overlayCatalog(value);
  assert.equal(result.exams.exams[0].fee.items[0].amount, 4);
});
