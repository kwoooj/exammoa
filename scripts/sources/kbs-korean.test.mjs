// node --test scripts/sources/kbs-korean.test.mjs
//
// 고정 데이터는 `data/archive/2026/kbs-korean.2026-08-13.*.html` 에서 그대로 옮겼다.
// 전에는 `build/crawl/kbs-korean.html` 을 읽고 없으면 `return` 했는데, 그 경로가
// `.gitignore` 대상이라 **CI 에서는 5건이 조용히 통과했다.**

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPECT_HEADERS, parse, volatile } from './kbs-korean.mjs';

/**
 * 실측 8행 그대로. 뒤 두 행이 **IBT 파일럿 온라인 시험**이라 회차 표기가
 * `제온라인1회` 다 — 숫자 회차가 아니라서 담기지 않는다 (아래 테스트가 못 박는다).
 */
const ROWS = [
  ['제89회', '2026.01.05. (월) 오전 09:00 ~ 2026.02.06. (금) 오후 06:00', '2026.02.07. (토) 오전 09:00 ~ 2026.02.22. (일) 오후 06:00', '2026.02.28. (토) 오전 10:00', '2026.03.12. (목)'],
  ['제90회', '2026.03.09. (월) 오전 09:00 ~ 2026.04.03. (금) 오후 06:00', '2026.04.04. (토) 오전 09:00 ~ 2026.04.12. (일) 오후 06:00', '2026.04.19. (일) 오전 10:00', '2026.04.30. (목)'],
  ['제91회', '2026.05.04. (월) 오전 09:00 ~ 2026.06.05. (금) 오후 06:00', '2026.06.06. (토) 오전 09:00 ~ 2026.06.14. (일) 오후 06:00', '2026.06.21. (일) 오전 10:00', '2026.07.02. (목)'],
  ['제92회', '2026.07.06. (월) 오전 09:00 ~ 2026.08.07. (금) 오후 06:00', '2026.08.08. (토) 오전 09:00 ~ 2026.08.16. (일) 오후 06:00', '2026.08.23. (일) 오전 10:00', '2026.09.03. (목)'],
  ['제93회', '2026.09.07. (월) 오전 09:00 ~ 2026.10.02. (금) 오후 06:00', '2026.10.03. (토) 오전 09:00 ~ 2026.10.11. (일) 오후 06:00', '2026.10.18. (일) 오전 10:00', '2026.10.29. (목)'],
  ['제94회', '2026.11.02. (월) 오전 09:00 ~ 2026.12.04. (금) 오후 06:00', '2026.12.05. (토) 오전 09:00 ~ 2026.12.13. (일) 오후 06:00', '2026.12.20. (일) 오전 10:00', '2026.12.31. (목)'],
  ['제온라인1회', '2026.04.30. (목) 오전 09:00 ~ 2026.05.14. (목) 오후 04:00', '-', '2026.05.17. (일) 오전 10:00', '2026.05.17. (일)'],
  ['제온라인2회', '2026.07.07. (화) 오전 09:00 ~ 2026.07.19. (일) 오후 06:00', '-', '2026.07.26. (일) 오전 10:00', '2026.07.26. (일)'],
];

const td = (cells, tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const page = (rows = ROWS) =>
  `<html><body><table>${td(EXPECT_HEADERS, 'th')}${rows.map(r => td(r)).join('')}</table></body></html>`;

const run = (rows) => parse(page(rows), { year: 2026 });

// ---- 회차 -------------------------------------------------------------

test('숫자 회차 6건을 뽑는다', () => {
  const { sessions, diagnostics } = run();
  assert.equal(diagnostics.headerMatch, true);
  assert.equal(sessions.length, 6);
  assert.deepEqual(sessions.map(s => s.seq), [89, 90, 91, 92, 93, 94]);
});

test('온라인 파일럿 회차는 담지 않는다 — 회차 번호가 없어 sessionId 를 만들 수 없다', () => {
  // `제온라인1회` 는 `제\d+회` 에 걸리지 않는다. 순서로 번호를 붙이면 파일럿이 늘거나
  // 줄 때마다 번호가 밀려 저장된 계획이 깨진다.
  const { sessions } = run();
  assert.ok(!sessions.some(s => s.label.includes('온라인')));
  const examDates = sessions.flatMap(s => s.events.filter(e => e.kind === 'exam').map(e => e.start));
  assert.ok(!examDates.includes('2026-05-17'), '온라인1회 시험일이 섞였다');
});

test('온라인 행을 빼는 것은 파싱 실패가 아니다', () => {
  assert.deepEqual(run().diagnostics.failures, []);
});

// ---- 날짜 -------------------------------------------------------------

test('제89회 날짜가 사이트와 일치한다', () => {
  const s = run().sessions.find(x => x.seq === 89);
  const pick = (kind, seq = 1) => s.events.find(e => e.kind === kind && e.seq === seq);
  assert.deepEqual([pick('reg').start, pick('reg').end], ['2026-01-05', '2026-02-06']);
  assert.deepEqual([pick('reg', 2).start, pick('reg', 2).end], ['2026-02-07', '2026-02-22']);
  assert.equal(pick('exam').start, '2026-02-28');
  assert.equal(pick('exam').end, '2026-02-28', '시험은 하루짜리다');
  assert.equal(pick('result').start, '2026-03-12');
});

test('날짜와 공식 시각을 각각 보존한다', () => {
  for (const s of run().sessions) {
    for (const e of s.events) {
      assert.match(e.start, /^\d{4}-\d{2}-\d{2}$/, `${s.label} ${e.label}`);
      assert.match(e.end, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  const s = run().sessions.find(x => x.seq === 92);
  assert.deepEqual(s.events.find(e => e.kind === 'reg' && e.seq === 1).timing, {
    start: '09:00', end: '18:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.deepEqual(s.events.find(e => e.kind === 'exam').timing, {
    start: '10:00', timezone: 'Asia/Seoul', status: 'confirmed',
  });
  assert.equal(s.events.find(e => e.kind === 'result').timing, undefined);
});

test('접수가 해를 넘기지 않는 범위에서 월을 넘긴다 (제94회 11/02~12/04)', () => {
  const s = run().sessions.find(x => x.seq === 94);
  const reg = s.events.find(e => e.kind === 'reg' && e.seq === 1);
  assert.deepEqual([reg.start, reg.end], ['2026-11-02', '2026-12-04']);
});

// ---- 추가접수 ----------------------------------------------------------

test('추가접수는 seq 2 — 정기 마감과 섞이면 D-Day 가 거짓이 된다', () => {
  for (const s of run().sessions) {
    const regs = s.events.filter(e => e.kind === 'reg').sort((a, b) => a.seq - b.seq);
    assert.equal(regs.length, 2, `${s.label} 접수가 2건이 아니다`);
    assert.equal(regs[1].note, '추가접수');
    assert.equal(regs[0].note, null);
    assert.ok(regs[1].start > regs[0].end, `${s.label} 추가접수가 정기 마감보다 빠르다`);
  }
});

test('추가접수 칸이 `-` 면 만들지 않는다', () => {
  const { sessions, diagnostics } = run([['제95회', '2026.01.05. (월) 오전 09:00 ~ 2026.02.06. (금) 오후 06:00', '-', '2026.02.28. (토) 오전 10:00', '2026.03.12. (목)']]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].events.filter(e => e.kind === 'reg').length, 1);
  assert.deepEqual(diagnostics.failures, [], '`-` 는 미정 표기지 파싱 실패가 아니다');
});

// ---- 형태 -------------------------------------------------------------

test('phase 는 전부 single 이다', () => {
  for (const s of run().sessions) for (const e of s.events) assert.equal(e.phase, 'single');
});

test('이벤트가 날짜순으로 정렬된다', () => {
  for (const s of run().sessions) {
    const dates = s.events.map(e => e.start);
    assert.deepEqual(dates, [...dates].sort(), `${s.label} 정렬이 어긋났다`);
  }
});

test('id 와 label 이 회차를 따른다', () => {
  const s = run().sessions.find(x => x.seq === 92);
  assert.equal(s.id, 'kbs-korean-2026-92');
  assert.equal(s.label, '제92회');
  assert.equal(s.groupId, 'kbs-korean');
});

// ---- 휘발성 필드 -------------------------------------------------------

test('아카이브 해시에서 지울 패턴을 선언한다 — 서버 시각이 매번 다르다', () => {
  assert.ok(volatile.length >= 2);
  const page = 'SERVER_NOW:"2026/08/13 16:12:42" D_DAY:-5 EXAM_DT:"2026.08.23"';
  const cleaned = volatile.reduce((s, re) => s.replace(re, ''), page);
  assert.ok(!cleaned.includes('16:12:42'));
  assert.ok(!cleaned.includes('D_DAY:-5'));
  assert.ok(cleaned.includes('2026.08.23'), '일정 값은 지우면 안 된다');
});

// ---- 실패 처리 ---------------------------------------------------------

test('헤더가 바뀌면 빈 결과 + headerMatch false', () => {
  const { sessions, diagnostics } = parse('<table><tr><th>가</th></tr><tr><td>1</td></tr></table>', { year: 2026 });
  assert.deepEqual(sessions, []);
  assert.equal(diagnostics.headerMatch, false);
});

test('빈 입력에도 던지지 않는다', () => {
  for (const bad of ['', null, undefined, '<html></html>']) {
    assert.doesNotThrow(() => parse(bad, { year: 2026 }));
  }
});

test('기대 헤더가 실측 표와 같다', () => {
  assert.deepEqual(EXPECT_HEADERS, ['시험회차', '접수기간', '추가 접수기간', '시험일시', '성적발표일']);
});
