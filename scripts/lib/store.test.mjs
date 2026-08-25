// node --test scripts/lib/store.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archive, forHashing, hashEvents, mergeStale } from './store.mjs';
import { volatile as kbsVolatile } from '../sources/kbs-korean.mjs';

/** 실측 스냅샷에서 잘라온 조각. 두 파일의 차이가 SERVER_NOW 딱 한 군데였다. */
const page = (serverNow, dday) => `<!doctype html><html><body>
<table><tr><td>제92회</td><td>2026.07.06.(월) ~ 2026.08.07.(금)</td></tr></table>
<script>window.__NUXT__=(function(){return {data:[{EXAM_APPLY_LIST:[
{SCHEDULE_SEQ:132,EXAM_DT:"2026.08.23. (일) 오전 10:00",EXAM_ROUND_NO:"92",D_DAY:${dday},APPLY_END_DT:"2026.08.07. (금) 오후  06:00"}
]}],state:{SERVER_NOW:"${serverNow}"}}}());</script>
</body></html>`;

const withTmp = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'exammoa-archive-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// ---- forHashing -------------------------------------------------------

test('휘발성 조각을 지운다', () => {
  const a = forHashing(page('2026/08/13 16:12:42', -5), kbsVolatile);
  const b = forHashing(page('2026/08/13 17:02:45', -5), kbsVolatile);
  assert.equal(a, b, '서버 시각만 다른 두 페이지가 같아져야 한다');
});

test('D_DAY 도 지운다 — 서버가 계산한 카운트다운이라 날이 바뀌면 달라진다', () => {
  const a = forHashing(page('2026/08/13 16:12:42', -5), kbsVolatile);
  const b = forHashing(page('2026/08/13 16:12:42', -4), kbsVolatile);
  assert.equal(a, b);
});

test('일정 값은 지우지 않는다 — 그게 바뀔 때 스냅샷이 남아야 한다', () => {
  const s = forHashing(page('2026/08/13 16:12:42', -5), kbsVolatile);
  assert.match(s, /2026\.08\.23/, '시험일이 사라졌다');
  assert.match(s, /2026\.08\.07/, '접수마감일이 사라졌다');
  assert.match(s, /제92회/);
});

test('패턴이 없으면 원문 그대로', () => {
  const s = page('2026/08/13 16:12:42', -5);
  assert.equal(forHashing(s), s);
  assert.equal(forHashing(s, []), s);
});

test('같은 정규식을 반복 적용해도 결과가 같다 — lastIndex 가 새지 않아야 한다', () => {
  const a = forHashing(page('x', 1), kbsVolatile);
  const b = forHashing(page('y', 2), kbsVolatile);
  const c = forHashing(page('z', 3), kbsVolatile);
  assert.equal(a, b);
  assert.equal(b, c);
});

test('이벤트 해시는 날짜뿐 아니라 공식 시각 변경도 감지한다', () => {
  const base = { kind: 'exam', phase: 'single', start: '2026-08-23', end: '2026-08-23', seq: 1 };
  const before = hashEvents([{ ...base, timing: { start: '09:00', timezone: 'Asia/Seoul', status: 'confirmed' } }]);
  const after = hashEvents([{ ...base, timing: { start: '10:00', timezone: 'Asia/Seoul', status: 'confirmed' } }]);
  assert.notEqual(before, after);
});

test('아직 관측하지 않은 카탈로그 회차의 시각을 오늘로 꾸미지 않는다', () => {
  const merged = mergeStale([{
    id: 'catalog-placeholders', method: 'manual', ok: true, observedAt: null,
    sessions: [{ id: 'g-2026-tbd', groupId: 'g', events: [] }],
  }], null, { now: '2026-08-25T00:00:00.000Z' });
  assert.equal(merged.sources['catalog-placeholders'].fetchedAt, null);
  assert.equal(merged.provenance['g-2026-tbd'].observedAt, null);
});

// ---- archive ----------------------------------------------------------

test('첫 스냅샷은 저장하고 확장자를 반영한다', () => withTmp(async (dir) => {
  const a = await archive({
    year: 2026, sourceId: 'kbs-korean', body: page('16:12:42', -5),
    volatile: kbsVolatile, ext: 'html', dir, stamp: '2026-08-13',
  });
  assert.equal(a.written, true);
  assert.equal(a.reason, '첫 스냅샷');
  assert.match(a.path, /kbs-korean\.2026-08-13\.[0-9a-f]{12}\.html$/);
}));

test('휘발성만 다르면 저장하지 않는다 — 이게 #17 의 본체다', () => withTmp(async (dir) => {
  const args = { year: 2026, sourceId: 'kbs-korean', volatile: kbsVolatile, ext: 'html', dir };
  await archive({ ...args, body: page('2026/08/13 16:12:42', -5), stamp: '2026-08-13' });
  const second = await archive({ ...args, body: page('2026/08/13 17:02:45', -5), stamp: '2026-08-13' });

  assert.equal(second.written, false);
  assert.equal(second.reason, '내용이 직전과 동일');
  const files = await readdir(join(dir, '2026'));
  assert.equal(files.length, 1, `실행마다 122KB 가 쌓인다 (실제 ${files.length}건)`);
}));

test('일정이 바뀌면 저장한다', () => withTmp(async (dir) => {
  const args = { year: 2026, sourceId: 'kbs-korean', volatile: kbsVolatile, ext: 'html', dir };
  await archive({ ...args, body: page('16:12:42', -5), stamp: '2026-08-13' });
  const moved = await archive({
    ...args,
    body: page('16:12:42', -5).replace('2026.08.23', '2026.08.30'),
    stamp: '2026-08-14',
  });
  assert.equal(moved.written, true);
  assert.equal(moved.reason, '내용이 바뀌었다');
  assert.equal((await readdir(join(dir, '2026'))).length, 2);
}));

test('저장된 바이트는 원본 그대로다 — 정규화 결과를 쓰면 --replay 가 원본을 못 만든다', () => withTmp(async (dir) => {
  const raw = page('2026/08/13 16:12:42', -5);
  const a = await archive({
    year: 2026, sourceId: 'kbs-korean', body: raw,
    volatile: kbsVolatile, ext: 'html', dir, stamp: '2026-08-13',
  });
  const saved = await readFile(a.path, 'utf8');
  assert.equal(saved, raw);
  assert.match(saved, /SERVER_NOW:"2026\/08\/13 16:12:42"/, '서버 시각이 파일에는 남아 있어야 한다');
}));

test('PDF 같은 바이너리 원문은 JSON 변환 없이 그대로 저장한다', () => withTmp(async (dir) => {
  const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
  const archived = await archive({
    year: 2026, sourceId: 'official-pdf', body: raw,
    ext: 'pdf', dir, stamp: '2026-08-24',
  });
  const saved = await readFile(archived.path);
  assert.deepEqual(saved, Buffer.from(raw));
}));

test('volatile 없이도 동작한다 — API 응답은 지울 것이 없다', () => withTmp(async (dir) => {
  const args = { year: 2026, sourceId: 'qnet', dir, stamp: '2026-08-13' };
  const a = await archive({ ...args, body: { items: [1, 2, 3] } });
  assert.equal(a.written, true);
  assert.match(a.path, /\.json$/, '기본 확장자는 json 이다');
  const b = await archive({ ...args, body: { items: [1, 2, 3] } });
  assert.equal(b.written, false);
}));

test('확장자가 바뀌어도 직전 스냅샷을 찾는다', () => withTmp(async (dir) => {
  const body = page('16:12:42', -5);
  const args = { year: 2026, sourceId: 'kbs-korean', body, volatile: kbsVolatile, dir, stamp: '2026-08-13' };
  await archive({ ...args, ext: 'json' });               // 옛 확장자로 이미 쌓인 것
  const next = await archive({ ...args, ext: 'html' });  // 새 확장자
  assert.equal(next.written, false, '확장자로 걸러 버리면 전량이 한 번 더 쌓인다');
}));

test('소스 id 가 접두어로 겹쳐도 섞이지 않는다', () => withTmp(async (dir) => {
  const args = { dir, year: 2026, stamp: '2026-08-13', ext: 'html' };
  const a = await archive({ ...args, sourceId: 'toeic', body: '토익' });
  const b = await archive({ ...args, sourceId: 'toeic-speaking', body: '토스' });
  assert.equal(a.written, true);
  assert.equal(b.written, true, 'toeic-speaking 이 toeic 의 스냅샷과 비교되면 안 된다');
  assert.equal((await readdir(join(dir, '2026'))).length, 2);
}));
