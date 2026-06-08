import { Choreography } from '../models/choreography.model';

export function toErlang(c: Choreography): string {
  const parts: string[] = [];
  const events: Array<{ timeMs: number; tok: string }> = [];
  let cursor = 0;

  if (c.mp3File) {
    if (c.volume !== undefined && c.volume !== 100) events.push({ timeMs: 0, tok: `{volume, ${c.volume}}` });
    events.push({ timeMs: 0, tok: `{mp3, <<"${c.mp3File}">>}` });
  }

  for (const sp of [...c.servoPoints].sort((a, b) => a.timeMs - b.timeMs)) {
    events.push({
      timeMs: sp.timeMs,
      tok: sp.durationMs > 0
        ? `{servo, ${sp.position}, ${sp.durationMs}}`
        : `{servo, ${sp.position}}`,
    });
  }

  for (const ev of events) {
    if (ev.timeMs > cursor) { parts.push(`{wait, ${ev.timeMs - cursor}}`); cursor = ev.timeMs; }
    parts.push(ev.tok);
  }

  if (c.mp3File) parts.push('{wait, sound}');
  parts.push('{servo, 100}', '{wait, 300}', '{servo, 0, 1500}');
  return parts.join(', ');
}

export function toChoreoJson(choreos: Choreography[]): Record<string, string> {
  return Object.fromEntries(choreos.map(c => [c.name, toErlang(c)]));
}
