import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KACPTA_DETAIL_SPECS, parseKacptaDetailBundle } from './kacpta-detail.mjs';
import { TAX_EXAMS } from './kacpta-tax.mjs';

const source = {
  id: 'kacpta-qualification-detail', authority: '한국세무사회',
  sourceUrl: 'https://license.kacta.or.kr/web/info/info_outline.aspx',
  examSlugs: ['전산세무1급', '전산세무2급', '전산회계1급', '전산회계2급', '세무회계1급', '세무회계2급', '세무회계3급', '기업회계1급', '기업회계2급', '기업회계3급'],
};

const overview = rows => `<table><tr><th colspan="2">종목 및 등급</th><th>시험구성</th><th>비고</th></tr>${rows.map(([name, grade]) => `<tr><td>${name}</td><td>${grade}</td><td>필기시험</td><td>비고</td></tr>`).join('')}</table>`;
const evaluation = fingerprints => `<table><tr><th>구분</th><th>평가범위</th><th>세부내용</th></tr>${fingerprints.map(value => `<tr><td>구분</td><td>${value}</td><td>범위</td></tr>`).join('')}</table>`;
const page = (family, rows, body, evaluations = []) => ({ family, url: `https://example.com/${family}`, html: `${overview(rows)}${body}${evaluations.map(evaluation).join('')}` });
const bundle = () => ({ pages: [
  page('computer', [['전산세무', '1급'], ['전산세무', '2급'], ['전산회계', '1급'], ['전산회계', '2급']], '자격의종류: 공인민간자격 접수수수료 30,000원 이론시험 객관식 4지선다형 실무시험 전산세무회계프로그램을 이용한 실기시험 법인세무조정(30%) 거래자료의 입력(40%) 종목및등급 시험 방법 시험과목 평가범위 요약 평가비율 제한시간 출제방법 전산세무1급 90분 전산세무2급 90분 전산회계1급 60분 전산회계2급 60분', [
    ['재무회계(10%)', '원가회계(10%)', '세무회계(10%)', '재무회계 및 원가회계(15%)', '부가가치세(15%)', '원천제세(10%)', '법인세무조정(30%)'],
    ['재무회계(10%)', '원가회계(10%)', '세무회계(10%)', '재무회계 및 원가회계(35%)', '부가가치세(20%)', '원천제세(15%)'],
    ['회계원리(15%)', '원가회계(10%)', '세무회계(5%)', '기초정보의 등록수정(15%)', '거래자료의 입력(30%)', '부가가치세(15%)', '입력자료 및 제장부 조회(10%)'],
    ['회계원리(30%)', '기초정보의 등록수정(20%)', '거래자료의 입력(40%)', '입력자료 및 제장부 조회(10%)'],
  ]),
  page('tax', [['세무회계', '1급'], ['세무회계', '2급'], ['세무회계', '3급']], '자격의종류: 공인민간자격 접수수수료 25,000원 객관식 15문항 주관식 5문항 약술형 2문항 세법1부·2부 각각 객관식 25문항 세법1부·2부 각각 객관식 20문항 종목및등급 시험 방법 시험과목 평가범위 요약 평가비율 제한시간 출제방법 세무회계1급 객관식 15문항 주관식 5문항 약술형 2문항 100분 세무회계2급 각각 객관식 25문항 80분 세무회계3급 각각 객관식 20문항 60분'),
  page('corporate', [['기업회계', '1급'], ['기업회계', '2급'], ['기업회계', '3급']], '자격의종류: 등록민간자격 접수수수료 25,000원 1부·2부 각각 객관식 20문항 주관식5문항 1부·2부 각각 객관식 25문항 1부·2부 각각 객관식 20문항 종목및등급 시험 방법 시험과목 평가범위 요약 평가비율 제한시간 출제방법 기업회계1급 객관식 20문항 주관식 5문항 100분 기업회계2급 각각 객관식 25문항 80분 기업회계3급 각각 객관식 20문항 60분'),
] });

test('한국세무사회 10종을 전수 발견하고 시험별 전체 제한시간으로 묶는다', () => {
  const result = parseKacptaDetailBundle(bundle(), { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.diagnostics, { discovered: 10, included: 10, missing: [], unclassified: [], failures: [] });
  const tax = result.details.find(detail => detail.examSlug === '세무회계1급');
  assert.equal(tax.formats[0].stages[0].durationMinutes, 100);
  assert.equal(tax.formats[0].stages[0].totalItemCount, 44);
  assert.equal(tax.formats[0].stages[0].timedBlocks, undefined);
  assert.deepEqual(tax.formats[0].stages[0].sections.map(section => section.itemCount), [22, 22]);
  const computer = result.details.find(detail => detail.examSlug === '전산세무1급');
  assert.equal(computer.classification.label, '국가공인 민간자격');
  assert.equal(computer.formats[0].stages[0].durationMinutes, 90);
  assert.deepEqual(computer.formats[0].stages[0].sections.map(section => section.scoreRange.max), [10, 10, 10, 15, 15, 10, 30]);
  assert.equal(computer.formats[0].stages[0].timedBlocks, undefined);
  assert.equal(result.details.find(detail => detail.examSlug === '기업회계1급').classification.label, '등록민간자격');
  assert.equal(result.details.find(detail => detail.examSlug === '기업회계1급').formats[0].stages[0].sections[0].note, '객관식 20문항 · 주관식 5문항');
});

test('공식 응시료 지문이 바뀌면 해당 3종 전체를 승인 후보에서 막는다', () => {
  const changed = bundle();
  changed.pages.find(page => page.family === 'tax').html = changed.pages.find(page => page.family === 'tax').html.replace('25,000원', '27,000원');
  const result = parseKacptaDetailBundle(changed, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.equal(result.details.length, 7);
  assert.deepEqual(result.diagnostics.missing, ['세무회계1급', '세무회계2급', '세무회계3급']);
  assert.match(result.diagnostics.failures.join('\n'), /접수수수료25,000원/);
});

test('공식 제한시간이 바뀌면 정적 값으로 조용히 게시하지 않는다', () => {
  const changed = bundle();
  changed.pages.find(page => page.family === 'corporate').html = changed.pages.find(page => page.family === 'corporate').html.replace('기업회계2급 각각 객관식 25문항 80분', '기업회계2급 각각 객관식 25문항 90분');
  const result = parseKacptaDetailBundle(changed, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.deepEqual(result.diagnostics.missing.filter(slug => slug.startsWith('기업회계')), ['기업회계1급', '기업회계2급', '기업회계3급']);
  assert.match(result.diagnostics.failures.join('\n'), /기업회계2급: 공식 시간·구성 지문 불일치/);
});

test('새 급수와 원문 페이지 누락을 무음 제외하지 않는다', () => {
  const changed = bundle();
  changed.pages[2].html = changed.pages[2].html.replace('</table>', '<tr><td>기업회계</td><td>4급</td><td>필기시험</td><td>비고</td></tr></table>');
  changed.pages = changed.pages.filter(page => page.family !== 'tax');
  const result = parseKacptaDetailBundle(changed, { source, observedAt: '2026-08-25T00:00:00.000Z' });
  assert.ok(result.diagnostics.unclassified.includes('기업회계4급'));
  assert.match(result.diagnostics.failures.join('\n'), /tax: 공식 시험개요 원문이 없다/);
  assert.ok(result.diagnostics.missing.includes('세무회계1급'));
});

test('상세 전체시간은 일정 수집기의 공식 시작·종료 시각과 10종 모두 일치한다', () => {
  const scheduleDurations = new Map(TAX_EXAMS.map(exam => {
    const [startHour, startMinute] = exam.start.split(':').map(Number);
    const [endHour, endMinute] = exam.end.split(':').map(Number);
    return [exam.slug, endHour * 60 + endMinute - startHour * 60 - startMinute];
  }));
  assert.deepEqual(
    KACPTA_DETAIL_SPECS.map(spec => [spec.slug, spec.durationMinutes]),
    TAX_EXAMS.map(exam => [exam.slug, scheduleDurations.get(exam.slug)]),
  );
});

test('10종 응시료는 세 공식 개요 URL과 금액·별도 결제수수료를 전수 참조한다', async () => {
  const seed = JSON.parse(await readFile('data/fees.seed.json', 'utf8'));
  const fees = new Map(seed.fees.map(record => [record.slug, record]));
  for (const spec of KACPTA_DETAIL_SPECS) {
    const record = fees.get(spec.slug);
    const computer = spec.family === 'computer';
    assert.equal(record.items[0].amount, computer ? 30000 : 25000, spec.slug);
    assert.equal(record.source.kind, 'page', spec.slug);
    assert.equal(record.source.url, `https://license.kacta.or.kr/web/info/${computer ? 'info_outline.aspx' : spec.family === 'tax' ? 'info_outline2.aspx' : 'info_outline3.aspx'}`, spec.slug);
    assert.match(record.note, /400원.*별도/, spec.slug);
  }
});
