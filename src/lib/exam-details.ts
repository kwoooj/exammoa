import type { AssessmentFormat, AssessmentMode } from '../types.ts';

export function activeFormat(formats: AssessmentFormat[], on: string): AssessmentFormat | undefined {
  return formats
    .filter(format => format.effectiveFrom <= on && (!format.effectiveTo || on <= format.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function durationLabel(value: number | { min?: number; max?: number } | undefined): string {
  if (value === undefined) return '공식 안내 없음';
  if (typeof value === 'object') {
    if (value.min !== undefined && value.max !== undefined) return `${value.min}~${value.max}분`;
    if (value.max !== undefined) return `최대 ${value.max}분`;
    if (value.min !== undefined) return `최소 ${value.min}분`;
    return '공식 안내 없음';
  }
  const h = Math.floor(value / 60);
  const m = value % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
}

export function formatDurationLabel(format: AssessmentFormat): string {
  if (format.totalDurationMinutes !== undefined) return durationLabel(format.totalDurationMinutes);
  const stages = format.stages
    .filter(stage => stage.durationMinutes !== undefined)
    .map(stage => `${stage.name.replace(/시험$/, '')} ${durationLabel(stage.durationMinutes)}`);
  return stages.length ? stages.join(' · ') : '공식 안내 없음';
}

export function countLabel(itemCount?: number | { min?: number; max?: number }, taskCount?: number): string {
  if (itemCount !== undefined) {
    if (typeof itemCount === 'number') return `${itemCount}문항`;
    if (itemCount.min !== undefined && itemCount.max !== undefined) return `${itemCount.min}~${itemCount.max}문항`;
    if (itemCount.max !== undefined) return `최대 ${itemCount.max}문항`;
    if (itemCount.min !== undefined) return `최소 ${itemCount.min}문항`;
  }
  return taskCount !== undefined ? `${taskCount}과제` : '—';
}

export function modeLabel(mode?: AssessmentMode): string {
  return mode === 'multiple-choice' ? '객관식'
    : mode === 'written' ? '필답형'
      : mode === 'interview' ? '말하기'
        : mode === 'computer-task' ? '컴퓨터 기반'
          : mode === 'mixed' ? '혼합형'
            : '—';
}

export function scoreLabel(range?: { min: number; max: number }): string {
  if (!range) return '—';
  return range.min === 0 ? `${range.max}점 만점` : `${range.min}~${range.max}점`;
}
