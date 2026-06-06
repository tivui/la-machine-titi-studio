import { Choreography, ServoPoint } from '../models/choreography.model';

/**
 * Parse une définition Erlang (format choreographies.json) en Choreography.
 * Supprime la séquence de fin standard : {servo,100},{wait,300},{servo,0,1500}
 */
export function parseErlangDef(name: string, def: string, themeId = ''): Choreography {
  const tokens: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < def.length; i++) {
    if (def[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (def[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        tokens.push(def.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Supprimer la séquence de fin : {servo, 100}, {wait, 300}, {servo, 0, 1500}
  let endIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].trim() === '{servo, 0, 1500}') { endIdx = i; break; }
  }
  if (endIdx >= 2 &&
      tokens[endIdx - 1].trim() === '{wait, 300}' &&
      tokens[endIdx - 2].trim() === '{servo, 100}') {
    tokens.splice(endIdx - 2, 3);
  }

  let cursor = 0;
  let mp3File = '';
  const servoPoints: ServoPoint[] = [];

  for (const token of tokens) {
    const inner    = token.slice(1, -1).trim();
    const commaIdx = inner.indexOf(',');
    const cmd      = commaIdx >= 0 ? inner.slice(0, commaIdx).trim() : inner.trim();

    if (cmd === 'servo') {
      const args = inner.slice(commaIdx + 1).trim().split(',').map(s => s.trim());
      const pos  = parseInt(args[0]);
      const dur  = args[1] ? parseInt(args[1]) : 0;
      if (!isNaN(pos)) {
        servoPoints.push({
          id: crypto.randomUUID(),
          timeMs: cursor,
          position: pos,
          durationMs: isNaN(dur) ? 0 : dur,
        });
      }
    } else if (cmd === 'wait') {
      const arg = inner.slice(commaIdx + 1).trim();
      if (arg !== 'sound') {
        const ms = parseInt(arg);
        if (!isNaN(ms)) cursor += ms;
      }
    } else if (cmd === 'mp3') {
      const m = inner.match(/<<"([^"]+)">>/);
      if (m) mp3File = m[1];
    }
  }

  return {
    id: crypto.randomUUID(),
    themeId,
    name,
    mp3File,
    mp3DurationMs: 0,
    servoPoints,
  };
}
