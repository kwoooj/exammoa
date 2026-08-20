import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from './kofia-investment.mjs';

const payload = JSON.stringify({
  schedulePage: '<h1>2026년도 연간시험일정</h1>',
  api: {
    examSchedList: [{
      standardY: '2026',
      licenseCd: 'FWM006',
      koreanExamNm: '투자자산운용사',
      timeCnt: 46,
      receiptSrtDtTm: '20260727100000',
      receiptEndDtTm: '20260731180000',
      examinationDt: '20260823',
      examinationTm: '10:00-12:00',
      successAnnDt: '20260903',
      successManAnnTm: '1000',
    }],
  },
});

test('투자자산운용사 접수·시험·발표 일정과 시간을 읽는다', () => {
  const { sessions, diagnostics } = parse(payload, { year: 2026 });
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 1);
  const session = sessions[0];
  assert.equal(session.id, 'kofia-investment-manager-2026-46');
  assert.deepEqual(session.events.find(event => event.kind === 'reg').timing, {
    start: '10:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(session.events.find(event => event.kind === 'exam').timing, {
    start: '10:00', end: '12:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(session.events.find(event => event.kind === 'result').timing, {
    start: '10:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
});

test('다른 자격과 다른 연도는 담지 않는다', () => {
  const decoded = JSON.parse(payload);
  decoded.api.examSchedList.push({ ...decoded.api.examSchedList[0], licenseCd: 'OTHER', timeCnt: 99 });
  decoded.api.examSchedList.push({ ...decoded.api.examSchedList[0], standardY: '2025', timeCnt: 45 });
  const result = parse(decoded, { year: 2026 });
  assert.equal(result.sessions.length, 1);
  assert.deepEqual(result.diagnostics.coverage.unclassified, ['OTHER|투자자산운용사']);
});

test('공식 보관 원본의 8개 코드를 전부 수집한다', async () => {
  const raw = await readFile('data/archive/2026/kofia-investment.2026-08-20.e14b5fcd90c6.json', 'utf8');
  const { sessions, diagnostics } = parse(raw, { year: 2026 });
  assert.equal(sessions.length, 19);
  assert.equal(new Set(sessions.map(session => session.groupId)).size, 8);
  assert.equal(diagnostics.coverage.discovered, 8);
  assert.equal(diagnostics.coverage.included, 8);
  assert.deepEqual(diagnostics.coverage.unclassified, []);
  assert.deepEqual(diagnostics.coverage.missing, []);
});

test('공식 API 배열이 사라지면 개편 신호로 실패한다', () => {
  const result = parse(JSON.stringify({ api: {} }), { year: 2026 });
  assert.equal(result.diagnostics.headerMatch, false);
});
