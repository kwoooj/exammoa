// node --test src/lib/links.test.ts
//
// 픽스처는 data/published/*.json 의 실측값을 손으로 옮긴 것이다. 파일에서 읽지
// 않는다 — 게시 데이터는 매일 배치가 다시 쓰므로 테스트가 코드가 아니라 데이터에
// 따라 깨진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exam, LinksFile, ScheduleGroup } from '../types.ts';
import {
  DENIED_JMCD,
  applyLink,
  jmCdWhitelist,
  officialLink,
  primaryLink,
  qnetDetailUrl,
  readLinks,
} from './links.ts';

// ---- 실측 픽스처 -------------------------------------------------------

const LINKS: LinksFile = {
  patterns: {
    qnetDetail: {
      template: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&jmCd={jmCd}',
      appliesTo: 'jmCd가 있는 모든 종목',
      verified: true,
    },
  },
  common: {
    qnetApplyGuide: 'https://www.q-net.or.kr/rcv001.do?id=rcv00103&gSite=Q',
    qnetExamList: 'https://www.q-net.or.kr/crf005.do?id=crf00501&gSite=Q',
  },
};

const 정보처리기사: Exam = {
  slug: '정보처리기사', name: '정보처리기사', short: '정처기', groupId: 'hrdk-regular',
  jmCd: '1320', qualgbCd: 'T', series: '기사', category: 'it', tier: 'T1', priority: 1,
};

/** 앞자리 0. 숫자로 저장하면 492 로 깨지는 코드다 */
const 승강기산업기사: Exam = {
  slug: '승강기산업기사', name: '승강기산업기사', short: null, groupId: 'hrdk-regular',
  jmCd: '0492', qualgbCd: 'T', series: '산업기사', category: 'eng', tier: 'T1', priority: 4,
};

/** jmCd 가 없다. Q-Net 밖 종목 */
const 토익: Exam = {
  slug: '토익', name: 'TOEIC', short: '토익', groupId: 'toeic',
  jmCd: null, qualgbCd: null, series: null, category: 'lang', tier: 'T3', priority: 1,
  agency: 'YBM',
};

const ITQ: Exam = {
  slug: 'ITQ', name: 'ITQ 정보기술자격', short: 'ITQ', groupId: 'kpc-itq',
  jmCd: null, qualgbCd: null, series: null, category: 'office', tier: 'T4', priority: 3,
  agency: '한국생산성본부', agencyUrl: 'https://license.kpc.or.kr', rolling: true,
};

const hrdkRegular: ScheduleGroup = {
  id: 'hrdk-regular', name: '국가기술자격 정기검정', agency: '한국산업인력공단',
  cadence: 'periodic', examSlugs: ['정보처리기사', '승강기산업기사'],
};

const toeicGroup: ScheduleGroup = {
  id: 'toeic', name: 'TOEIC', agency: 'YBM', cadence: 'frequent', examSlugs: ['토익'],
  agencyUrl: 'https://exam.toeic.co.kr/receipt/examSchList.php',
};

const korchamRolling: ScheduleGroup = {
  id: 'korcham-rolling', name: '컴퓨터활용능력 · 워드프로세서', agency: '대한상공회의소',
  cadence: 'rolling', examSlugs: ['컴퓨터활용능력1급'],
  agencyUrl: 'https://license.korcham.net',
  applyUrl: 'https://license.korcham.net/ex/dailyExam_join.do',
};

const 컴활1급: Exam = {
  slug: '컴퓨터활용능력1급', name: '컴퓨터활용능력 1급', short: '컴활1급', groupId: 'korcham-rolling',
  jmCd: null, qualgbCd: null, series: null, category: 'office', tier: 'T4', priority: 1,
  rolling: true,
};

/** 그룹에도 종목에도 링크가 없고 jmCd 도 없는 경우 */
const 링크없음: Exam = {
  slug: '링크없음', name: '링크 없는 시험', short: null, groupId: 'nowhere',
  jmCd: null, qualgbCd: null, series: null, category: 'it', tier: 'T3', priority: 4,
};
const nowhere: ScheduleGroup = {
  id: 'nowhere', name: '어디에도 없음', agency: '미상', cadence: 'periodic', examSlugs: ['링크없음'],
};

const WL = jmCdWhitelist([정보처리기사, 승강기산업기사, 토익, ITQ, 컴활1급, 링크없음]);

// ---- jmCdWhitelist -----------------------------------------------------

test('화이트리스트는 데이터에 실제로 있는 코드만 담는다', () => {
  assert.equal(WL.size, 2);
  assert.ok(WL.has('1320'));
  assert.ok(WL.has('0492'));
});

test('화이트리스트가 앞자리 0 을 지운다면 0492 는 조립되지 않는다', () => {
  // 숫자로 다루면 492 가 되어 전혀 다른 종목을 가리킨다.
  assert.ok(WL.has('0492'));
  assert.ok(!WL.has('492'));
});

test('거부 목록의 코드는 데이터에 있어도 화이트리스트에 안 들어간다', () => {
  const 폐지: Exam = { ...정보처리기사, slug: '폐지된기사', name: '폐지된 기사', jmCd: '2010' };
  const wl = jmCdWhitelist([폐지]);
  assert.equal(wl.size, 0);
});

test('거부 목록에 실측으로 확인된 세 코드가 들어 있다', () => {
  for (const bad of ['9999', '0000', '2010']) assert.ok(DENIED_JMCD.has(bad), bad);
});

// ---- qnetDetailUrl -----------------------------------------------------

test('정보처리기사의 Q-Net 상세 주소를 정확히 만든다', () => {
  // 이 리터럴이 고정이다. 템플릿을 손대면 51개 페이지가 조용히 다른 곳을 가리킨다.
  assert.equal(
    qnetDetailUrl('1320', LINKS, WL),
    'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&jmCd=1320',
  );
});

test('앞자리 0 을 그대로 끼운다', () => {
  assert.equal(
    qnetDetailUrl('0492', LINKS, WL),
    'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&jmCd=0492',
  );
});

test('jmCd 가 없으면 조립하지 않는다', () => {
  assert.equal(qnetDetailUrl(null, LINKS, WL), null);
});

test('엉뚱한 종목을 주는 코드는 절대 조립하지 않는다', () => {
  for (const bad of ['9999', '0000', '2010']) {
    const wl = new Set([...WL, bad]); // 화이트리스트에 섞여 들어와도
    assert.equal(qnetDetailUrl(bad, LINKS, wl), null, bad);
  }
});

test('형식이 4자리가 아니면 조립하지 않는다', () => {
  for (const bad of ['132', '13200', 'abcd', '', '1 320']) {
    assert.equal(qnetDetailUrl(bad, LINKS, WL), null, bad);
  }
});

test('데이터에 없는 코드는 형식이 맞아도 조립하지 않는다', () => {
  // 미지정 코드는 오류가 아니라 백지 페이지를 준다.
  assert.equal(qnetDetailUrl('7777', LINKS, WL), null);
});

test('검증되지 않은 템플릿으로는 조립하지 않는다', () => {
  const unverified: LinksFile = { patterns: { qnetDetail: { template: LINKS.patterns!.qnetDetail!.template } } };
  assert.equal(qnetDetailUrl('1320', unverified, WL), null);
});

test('치환 자리가 없는 템플릿은 조립하지 않는다', () => {
  const broken: LinksFile = { patterns: { qnetDetail: { template: 'https://www.q-net.or.kr/', verified: true } } };
  assert.equal(qnetDetailUrl('1320', broken, WL), null);
});

// ---- readLinks ---------------------------------------------------------

test('links 블록이 없어도 빈 객체를 준다', () => {
  assert.deepEqual(readLinks({}), {});
  assert.deepEqual(readLinks({ links: undefined }), {});
});

test('links 가 객체가 아니면 빈 객체를 준다', () => {
  assert.deepEqual(readLinks({ links: 'nope' as unknown as LinksFile }), {});
});

// ---- officialLink ------------------------------------------------------

test('종목의 agencyUrl 이 그룹 것보다 우선한다', () => {
  // 한 그룹이 여러 기관의 종목을 담을 수 있다. 그룹을 먼저 쓰면 다른 기관으로 보낸다.
  const g: ScheduleGroup = { ...toeicGroup, id: 'kpc-itq', agencyUrl: 'https://다른기관.example' };
  const l = officialLink(ITQ, g, LINKS, WL);
  assert.equal(l.href, 'https://license.kpc.or.kr');
  assert.equal(l.source, 'exam.agencyUrl');
});

test('종목에 없으면 그룹의 agencyUrl 을 쓴다', () => {
  const l = officialLink(토익, toeicGroup, LINKS, WL);
  assert.equal(l.href, 'https://exam.toeic.co.kr/receipt/examSchList.php');
  assert.equal(l.source, 'group.agencyUrl');
});

test('둘 다 없으면 jmCd 로 Q-Net 상세를 만든다', () => {
  const l = officialLink(정보처리기사, hrdkRegular, LINKS, WL);
  assert.equal(l.kind, 'official');
  assert.equal(l.source, 'qnet-detail');
  assert.equal(l.href, 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&jmCd=1320');
});

test('어디에도 없으면 버튼 대신 확인 중 문구를 낸다', () => {
  const l = officialLink(링크없음, nowhere, LINKS, WL);
  assert.equal(l.kind, 'none');
  assert.equal(l.href, null);
  assert.equal(l.label, '공식 링크 확인 중');
});

test('그룹을 못 찾아도 죽지 않는다', () => {
  const l = officialLink(정보처리기사, undefined, LINKS, WL);
  assert.equal(l.source, 'qnet-detail');
});

// ---- applyLink ---------------------------------------------------------

test('그룹에 원서접수 주소가 있으면 그대로 쓴다', () => {
  const l = applyLink(컴활1급, korchamRolling, LINKS, WL);
  assert.equal(l.kind, 'apply');
  assert.equal(l.label, '원서접수');
  assert.equal(l.href, 'https://license.korcham.net/ex/dailyExam_join.do');
});

test('Q-Net 종목은 일반 안내로 보내되 문구를 바꾼다', () => {
  // "원서접수" 라고 적으면 그 버튼이 접수창을 열어 줄 것처럼 읽힌다.
  const l = applyLink(정보처리기사, hrdkRegular, LINKS, WL);
  assert.equal(l.kind, 'apply-guide');
  assert.equal(l.label, '원서접수 안내');
  assert.equal(l.href, 'https://www.q-net.or.kr/rcv001.do?id=rcv00103&gSite=Q');
});

test('Q-Net 밖 종목을 Q-Net 접수 안내로 보내지 않는다', () => {
  const l = applyLink(토익, toeicGroup, LINKS, WL);
  assert.equal(l.kind, 'none');
});

// ---- primaryLink -------------------------------------------------------

test('목록 한 행에서는 접수처가 공식 정보보다 우선한다', () => {
  const l = primaryLink(컴활1급, korchamRolling, LINKS, WL);
  assert.equal(l.source, 'group.applyUrl');
});

test('접수처가 없으면 공식 정보로 내려간다', () => {
  const l = primaryLink(토익, toeicGroup, LINKS, WL);
  assert.equal(l.source, 'group.agencyUrl');
});

test('전부 없으면 확인 중', () => {
  assert.equal(primaryLink(링크없음, nowhere, LINKS, WL).kind, 'none');
});

// ---- 접근성 이름 -------------------------------------------------------

test('접근성 이름에 기관·종목·행동·새 창이 모두 들어간다', () => {
  const l = officialLink(정보처리기사, hrdkRegular, LINKS, WL);
  assert.equal(l.a11yLabel, '한국산업인력공단 정보처리기사 공식 시험정보 새 창 열기');
});

test('종목이 기관을 직접 들고 있으면 그것을 쓴다', () => {
  const l = officialLink(토익, toeicGroup, LINKS, WL);
  assert.equal(l.a11yLabel, 'YBM TOEIC 공식 시험정보 새 창 열기');
});

test('기관을 알 수 없어도 이름이 비지 않는다', () => {
  const l = officialLink(정보처리기사, undefined, LINKS, WL);
  assert.equal(l.a11yLabel, '시행기관 정보처리기사 공식 시험정보 새 창 열기');
});

// ---- 부분 실패 --------------------------------------------------------

test('links 블록이 통째로 없어도 그룹 링크로 동작한다', () => {
  const l = officialLink(토익, toeicGroup, {}, WL);
  assert.equal(l.href, 'https://exam.toeic.co.kr/receipt/examSchList.php');
});

test('links 블록이 없으면 Q-Net 조립만 조용히 빠진다', () => {
  const l = officialLink(정보처리기사, hrdkRegular, {}, WL);
  assert.equal(l.kind, 'none');
});
