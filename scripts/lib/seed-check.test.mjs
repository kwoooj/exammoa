// node --test scripts/lib/seed-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkSeeds, formatProblems } from './seed-check.mjs';

const exam = (over = {}) => ({
  slug: '정보처리기사', name: '정보처리기사', short: '정처기',
  groupId: 'hrdk-regular', jmCd: '1320', qualgbCd: 'T', series: '기사',
  category: 'it', tier: 'T1', priority: 1, agency: '한국산업인력공단', ...over,
});

const group = (over = {}) => ({
  id: 'hrdk-regular', name: '국가기술자격 정기', agency: '한국산업인력공단',
  cadence: 'periodic', examSlugs: ['정보처리기사'], collect: 'qnet-api', ...over,
});

const seed = (exams, groups) => [
  {
    exams,
    tiers: { T1: '', T2: '', T3: '', T4: '', X: '' },
    categories: [{ id: 'it', name: 'IT' }, { id: 'office', name: '사무' }],
  },
  { groups },
];

const codes = (exams, groups) => checkSeeds(...seed(exams, groups)).problems.map(p => p.code);

// ---- 정상 -------------------------------------------------------------

test('짝이 맞으면 통과', () => {
  const r = checkSeeds(...seed([exam()], [group()]));
  assert.equal(r.ok, true, formatProblems(r.problems));
});

// ---- 네 번 겪은 그 구멍 -------------------------------------------------

test('그룹이 없는 종목을 가리키면 잡는다 — 이것을 네 번 손으로 찾았다', () => {
  const c = codes([exam()], [group(), group({ id: 'kpc-itq', examSlugs: ['ITQ'], collect: 'manual' })]);
  assert.ok(c.includes('group-dangling-exam'), c.join(', '));
});

test('반대 방향도 잡는다 — 종목이 없는 그룹을 가리키는 경우', () => {
  const c = codes([exam({ groupId: '없는그룹' })], [group()]);
  assert.ok(c.includes('exam-dangling-group'), c.join(', '));
});

test('한쪽만 알고 있는 소속을 잡는다', () => {
  // 종목은 그룹을 가리키는데 그룹의 examSlugs 에는 없다
  const c = codes([exam()], [group({ examSlugs: [] })]);
  assert.ok(c.includes('membership-one-way'), c.join(', '));
  assert.ok(c.includes('group-empty'), c.join(', '));
});

test('그룹이 남의 종목을 가져가면 잡는다', () => {
  const c = codes(
    [exam(), exam({ slug: 'SQLD', groupId: 'kdata-sqld', jmCd: null, tier: 'T3' })],
    [group({ examSlugs: ['정보처리기사', 'SQLD'] }), group({ id: 'kdata-sqld', examSlugs: ['SQLD'] })],
  );
  assert.ok(c.includes('membership-mismatch'), c.join(', '));
});

test('groupId 가 아예 없으면 잡는다', () => {
  const e = exam();
  delete e.groupId;
  assert.ok(codes([e], [group({ examSlugs: [] })]).includes('exam-no-group'));
});

// ---- 중복 -------------------------------------------------------------

test('slug·id 중복을 잡는다', () => {
  assert.ok(codes([exam(), exam()], [group()]).includes('dup-exam'));
  assert.ok(codes([exam()], [group(), group()]).includes('dup-group'));
});

// ---- 선언한 값만 -------------------------------------------------------

test('tiers 선언에 없는 tier 를 잡는다', () => {
  assert.ok(codes([exam({ tier: 'T9' })], [group()]).includes('unknown-tier'));
});

test('시드가 선언한 tier 는 통과한다 — 목록을 코드에 하드코딩하지 않는다', () => {
  // X 는 시드가 "v0 대상 아님" 으로 선언한 값이다. 코드가 모른다고 틀린 것이 아니다.
  assert.ok(!codes([exam({ tier: 'X' })], [group()]).includes('unknown-tier'));
});

test('categories 에 없는 category 를 잡는다', () => {
  assert.ok(codes([exam({ category: '없음' })], [group()]).includes('unknown-category'));
});

// ---- 화면 필수 표기 ----------------------------------------------------

test('agency 없는 그룹을 잡는다 — 없으면 빅분기가 공단 일정으로 오인된다', () => {
  const g = group();
  delete g.agency;
  assert.ok(codes([exam()], [g]).includes('group-no-agency'));
});

// ---- 상시시험 ---------------------------------------------------------

const rollingPair = (over = {}) => codes(
  [exam({ slug: 'ITQ', groupId: 'kpc-itq', category: 'office', tier: 'T4', jmCd: null, rolling: true })],
  [group({
    id: 'kpc-itq', examSlugs: ['ITQ'], cadence: 'rolling', collect: 'manual',
    rollingRule: '매월 시행', ruleCheckedAt: '2026-08-13', ...over,
  })],
);

test('상시 그룹 한 쌍은 통과한다', () => {
  assert.deepEqual(rollingPair(), []);
});

test('rollingRule 없는 rolling 그룹을 잡는다 — 카드가 빈다', () => {
  assert.ok(rollingPair({ rollingRule: undefined }).includes('rolling-no-rule'));
});

test('ruleCheckedAt 이 없거나 형식이 틀리면 잡는다 — 규칙이 낡아도 아무도 모른다', () => {
  assert.ok(rollingPair({ ruleCheckedAt: undefined }).includes('rolling-no-checked-at'));
  assert.ok(rollingPair({ ruleCheckedAt: '2026년 8월' }).includes('bad-checked-at'));
});

test('종목과 그룹의 rolling 판단이 어긋나면 잡는다', () => {
  // 종목만 rolling
  const c1 = codes([exam({ rolling: true })], [group()]);
  assert.ok(c1.includes('rolling-mismatch'), c1.join(', '));
  // 그룹만 rolling
  const c2 = codes([exam()], [group({ cadence: 'rolling', rollingRule: 'x', ruleCheckedAt: '2026-08-13' })]);
  assert.ok(c2.includes('rolling-mismatch'), c2.join(', '));
});

// ---- robots 경계 -------------------------------------------------------

test('수집 대상이 아닌데 sourceUrl 이 있으면 잡는다 — 규칙 3 의 경계다', () => {
  const c = codes([exam()], [group({ collect: 'manual', sourceUrl: 'https://www.opic.or.kr' })]);
  assert.ok(c.includes('source-url-outside-crawl'), c.join(', '));
});

test('crawl 인데 sourceUrl 이 없으면 잡는다', () => {
  assert.ok(codes([exam()], [group({ collect: 'crawl' })]).includes('crawl-no-source'));
});

test('http(s) 아닌 URL 을 잡는다', () => {
  const c = codes([exam()], [group({ collect: 'crawl', sourceUrl: 'www.ihd.or.kr/guidecert1.do' })]);
  assert.ok(c.includes('bad-url'), c.join(', '));
});

// ---- 빈 입력 ----------------------------------------------------------

test('빈 시드를 잡는다', () => {
  const c = checkSeeds({ exams: [] }, { groups: [] }).problems.map(p => p.code);
  assert.ok(c.includes('empty-exams'));
  assert.ok(c.includes('empty-groups'));
});

test('null 을 받아도 죽지 않는다', () => {
  assert.equal(checkSeeds(null, null).ok, false);
});

// ---- 실제 시드 --------------------------------------------------------

test('저장소의 시드가 통과한다', async () => {
  const [e, g] = await Promise.all([
    readFile('data/exams.seed.json', 'utf8').then(JSON.parse),
    readFile('data/groups.seed.json', 'utf8').then(JSON.parse),
  ]);
  const r = checkSeeds(e, g);
  assert.equal(r.ok, true, formatProblems(r.problems));
});

// ---- 출력 -------------------------------------------------------------

test('문제가 없으면 그렇게 말한다', () => {
  assert.match(formatProblems([]), /이상 없음/);
});

test('문제를 코드와 함께 적는다 — 어디를 고쳐야 하는지 알아야 한다', () => {
  const out = formatProblems(checkSeeds(...seed([exam()], [group({ examSlugs: ['없는종목'] })])).problems);
  assert.match(out, /group-dangling-exam/);
  assert.match(out, /없는종목/);
});
