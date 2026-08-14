// node --test src/lib/calcolors.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEUTRAL, PALETTE_SIZE, assignColors, colorClass, swatchClass } from './calcolors.ts';

test('그룹이 하나면 색을 쓰지 않는다', () => {
  // 구분하지 않는 색은 장식이다 (§13.2). 시험 상세가 이 경우다.
  const map = assignColors(['hrdk-regular']);
  assert.equal(map.get('hrdk-regular'), NEUTRAL);
});

test('그룹이 없어도 죽지 않는다', () => {
  assert.equal(assignColors([]).size, 0);
});

test('그룹이 둘 이상이면 서로 다른 색을 준다', () => {
  const map = assignColors(['a', 'b', 'c']);
  assert.deepEqual([...map.values()], [0, 1, 2]);
});

test('같은 그룹이 여러 번 나와도 한 번만 센다', () => {
  // 한 그룹의 이벤트가 여러 개라 groupId 가 반복해서 들어온다.
  const map = assignColors(['a', 'a', 'b', 'a', 'b']);
  assert.equal(map.size, 2);
  assert.deepEqual([...map.values()], [0, 1]);
});

test('반복이 있어도 그룹이 하나면 중립이다', () => {
  assert.equal(assignColors(['a', 'a', 'a']).get('a'), NEUTRAL);
});

test('순서가 색을 정한다 — 해시를 쓰지 않는다', () => {
  // 해시로 배정하면 두 그룹이 같은 색을 받는 사고가 나고, 그때 화면에서는
  // 서로 다른 시험이 한 시험처럼 보인다.
  assert.deepEqual([...assignColors(['b', 'a']).entries()], [['b', 0], ['a', 1]]);
  assert.deepEqual([...assignColors(['a', 'b']).entries()], [['a', 0], ['b', 1]]);
});

test('팔레트를 넘으면 돌아간다', () => {
  const ids = Array.from({ length: PALETTE_SIZE + 2 }, (_, i) => `g${i}`);
  const map = assignColors(ids);
  assert.equal(map.get('g0'), 0);
  assert.equal(map.get(`g${PALETTE_SIZE}`), 0);
  assert.equal(map.get(`g${PALETTE_SIZE + 1}`), 1);
});

test('통합 캘린더의 최대 선택 수만큼은 색이 겹치지 않는다', () => {
  const ids = Array.from({ length: PALETTE_SIZE }, (_, i) => `g${i}`);
  const used = new Set(assignColors(ids).values());
  assert.equal(used.size, PALETTE_SIZE);
});

test('클래스 이름은 1부터 센다', () => {
  assert.equal(colorClass(0), 'cal__bar--c1');
  assert.equal(colorClass(5), 'cal__bar--c6');
  assert.equal(colorClass(NEUTRAL), '');
});

test('견본 클래스도 같은 번호를 쓴다', () => {
  assert.equal(swatchClass(0), 'swatch swatch--c1');
  assert.equal(swatchClass(NEUTRAL), 'swatch');
});
