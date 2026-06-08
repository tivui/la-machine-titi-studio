import { Injectable, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { Choreography, ChoreographyTheme } from '../models/choreography.model';
import { parseErlangDef } from '../utils/erlang-parser';

const LS_KEY    = 'lm-choreo-v2';
const LS_KEY_V1 = 'lm-studio-choreos'; // clé de l'ancienne version (migration)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = generateClient<any>();

// ── Données mock (fallback sans sandbox) ──────────────────────────────────────

const MOCK_THEMES: ChoreographyTheme[] = [
  {
    id: '__original__',
    name: 'Original Paul Guyot',
    description: 'Chorégraphies du firmware original de La Machine',
    emoji: '🎭',
    isBuiltIn: true,
  },
  {
    id: '__psg__',
    name: 'PSG',
    description: 'Chorégraphies personnalisées',
    emoji: '⚽',
    isBuiltIn: false,
  },
];

// Définitions Erlang pré-chargées (extraites de la_machine/choreographies.json)
const RAW_DEFS: Array<{ themeId: string; name: string; def: string }> = [
  {
    themeId: '__original__', name: 'calling_silent',
    def: '{servo, 19}, {wait, 115}, {servo, 0}, {wait, 116}, {servo, 19}, {wait, 122}, {servo, 0}',
  },
  {
    themeId: '__original__', name: 'calling_silent2',
    def: '{servo, 10, 80}, {wait, 98}, {servo, 0}, {wait, 105}, {servo, 10}, {wait, 88}, {servo, 0}, {wait, 104}, {servo, 10}, {wait, 89}, {servo, 0}, {wait, 88}, {servo, 10}, {wait, 89}, {servo, 0}, {wait, 94}, {servo, 10}, {wait, 83}, {servo, 0}',
  },
  {
    themeId: '__original__', name: 'calling_silent3',
    def: '{wait, 5}, {servo, 11, 1000}, {wait, 1010}, {servo, 0, 980}',
  },
  {
    themeId: '__original__', name: 'meuh_03676',
    def: '{servo, 60, 2500}, {wait, 1000}, {mp3, <<"meuh/03676.mp3">>}, {wait, 4754}, {servo, 0, 800}',
  },
  {
    themeId: '__original__', name: 'system_batterylow',
    def: '{mp3, <<"_other/00043.mp3">>}, {wait, 578}, {servo, 100, 4480}, {wait, 4400}, {mp3, <<"_other/00043.mp3">>}, {wait, 438}, {servo, 0, 3600}',
  },
  {
    themeId: '__original__', name: 'system_welcome',
    def: '{servo, 50, 360}, {wait, 401}, {servo, 43}, {wait, 3}, {mp3, <<"joy/02110.mp3">>}, {wait, 142}, {servo, 52}, {wait, 146}, {servo, 42}, {wait, 276}, {servo, 67}, {wait, 422}, {servo, 81, 360}, {wait, 386}, {servo, 49, 320}, {wait, 359}, {servo, 52}, {wait, 31}, {servo, 46}, {wait, 42}, {servo, 52}, {wait, 42}, {servo, 45, 80}, {wait, 31}, {servo, 52}, {wait, 73}, {servo, 54}, {wait, 47}, {servo, 46}, {wait, 52}, {servo, 54}, {wait, 52}, {servo, 47}, {wait, 83}, {servo, 38, 520}, {wait, 547}, {servo, 76}, {wait, 66}, {mp3, <<"joy/02220.mp3">>}, {wait, 200}, {servo, 46, 620}, {wait, 656}, {servo, 77}, {wait, 479}, {servo, 79}, {wait, 42}, {servo, 73}, {wait, 36}, {servo, 78}, {wait, 37}, {servo, 73}, {wait, 41}, {servo, 79}, {wait, 63}, {servo, 72}, {wait, 62}, {servo, 79}, {wait, 52}, {servo, 73}, {wait, 58}, {servo, 80}, {wait, 57}, {servo, 73}, {wait, 36}, {servo, 78}, {wait, 47}, {servo, 71}, {wait, 52}, {servo, 78}, {wait, 360}, {servo, 32, 860}, {wait, 869}, {servo, 41, 80}, {wait, 52}, {mp3, <<"joy/02275.mp3">>}, {wait, 115}, {servo, 28}, {wait, 125}, {servo, 57}, {wait, 214}, {servo, 49}, {wait, 109}, {servo, 42}, {wait, 68}, {servo, 35}, {wait, 125}, {servo, 29}, {wait, 135}, {servo, 60}, {wait, 453}, {servo, 53}, {wait, 89}, {servo, 44}, {wait, 146}, {servo, 36}, {wait, 104}, {servo, 27}, {wait, 114}, {servo, 17}, {wait, 183}, {servo, 6}, {wait, 182}, {servo, 100}, {wait, 500}, {mp3, <<"hits/00247.mp3">>}, {wait, 203}, {servo, 0}',
  },
  {
    themeId: '__psg__', name: 'joy_01',
    def: '{servo, 0}, {mp3, <<"personal/champions-league.mp3">>}, {wait, 1000}, {servo, 20, 1000}, {wait, 1200}, {servo, 55, 800}, {wait, 1000}, {servo, 70}, {wait, 800}, {servo, 35, 400}, {wait, 500}, {servo, 85, 800}, {wait, 1000}, {servo, 95}, {wait, 900}, {servo, 60, 500}, {wait, 700}, {servo, 75}, {wait, 1000}, {servo, 80}, {wait, 1200}, {servo, 70, 400}, {wait, 600}, {servo, 85}, {wait, 700}, {servo, 45, 600}, {wait, 800}, {servo, 70}, {wait, 800}, {servo, 82}, {wait, 700}, {servo, 0, 400}, {wait, 500}, {servo, 100}, {wait, 1200}, {servo, 90}, {wait, 2500}, {servo, 65, 1500}, {wait, sound}, {servo, 100}, {wait, 300}, {servo, 0, 1500}',
  },
  {
    themeId: '__psg__', name: 'joy_02',
    def: '{servo, 0}, {mp3, <<"personal/allezparis.mp3">>}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 95}, {wait, 500}, {servo, 85}, {wait, 400}, {servo, 95}, {wait, 400}, {servo, 88}, {wait, 400}, {servo, 35, 400}, {wait, 500}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 95}, {wait, 400}, {servo, 100}, {wait, 600}, {servo, 90}, {wait, 400}, {servo, 100}, {wait, 400}, {servo, 88}, {wait, 400}, {servo, 55, 1000}, {wait, sound}, {servo, 100}, {wait, 300}, {servo, 0, 1500}',
  },
];

interface StoredState {
  themes: ChoreographyTheme[];
  choreos: Choreography[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ChoreographyService {
  private readonly _themes  = signal<ChoreographyTheme[]>([]);
  private readonly _choreos = signal<Choreography[]>([]);
  private readonly _loading = signal(true);
  private _source: 'appsync' | 'local' = 'local';
  private _remoteIds = new Set<string>();

  readonly themes  = this._themes.asReadonly();
  readonly choreos = this._choreos.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this._loading.set(true);
    try {
      await this.loadFromAppSync();
    } catch (err) {
      console.info('[ChoreographyService] AppSync indisponible, fallback local:', err instanceof Error ? err.message : err);
      this.loadFromLocalStorage();
    } finally {
      this._loading.set(false);
    }
  }

  // ── AppSync ───────────────────────────────────────────────────────────────

  private async loadFromAppSync(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: themes, errors } = await (client as any).models.ChoreographyTheme.list({
      selectionSet: [
        'id', 'name', 'description', 'emoji', 'isBuiltIn', 'imageS3Key',
        'choreographies.id', 'choreographies.themeId', 'choreographies.name',
        'choreographies.mp3File', 'choreographies.mp3DurationMs', 'choreographies.servoPointsJson',
      ],
    });

    if (errors?.length) throw new Error(errors[0].message);

    if (!themes || themes.length === 0) {
      this.loadFromLocalStorage();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedThemes: ChoreographyTheme[] = (themes as any[]).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      emoji: t.emoji ?? '🎵',
      isBuiltIn: t.isBuiltIn ?? false,
      imageS3Key: t.imageS3Key ?? undefined,
    }));
    mappedThemes.sort((a, b) => {
      if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const mappedChoreos: Choreography[] = (themes as any[]).flatMap( // eslint-disable-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => (t.choreographies ?? []).map((c: any): Choreography => ({
        id:           c.id,
        themeId:      c.themeId,
        name:         c.name,
        mp3File:      c.mp3File ?? '',
        mp3DurationMs: c.mp3DurationMs ?? 0,
        servoPoints:  this.parseSP(c.servoPointsJson),
      }))
    );

    this._themes.set(mappedThemes);
    this._choreos.set(mappedChoreos);
    this._remoteIds = new Set(mappedChoreos.map(c => c.id));
    this._source = 'appsync';
    console.info(`[ChoreographyService] ${mappedThemes.length} thèmes, ${mappedChoreos.length} chorégraphies depuis AppSync ✓`);
  }

  // ── localStorage + mock ───────────────────────────────────────────────────

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const { themes, choreos } = JSON.parse(stored) as StoredState;
        if (themes?.length > 0) {
          this._themes.set(themes);
          this._choreos.set(choreos ?? []);
          this._source = 'local';
          this.migrateV1();
          return;
        }
      }
    } catch { /* ignore */ }

    // Première utilisation : initialiser depuis le mock
    const mockChoreos = RAW_DEFS.map(({ themeId, name, def }) => parseErlangDef(name, def, themeId));
    this._themes.set(MOCK_THEMES);
    this._choreos.set(mockChoreos);
    this._source = 'local';
    this.migrateV1();
    this.persistLocal();
  }

  private migrateV1(): void {
    const old = localStorage.getItem(LS_KEY_V1);
    if (!old) return;
    try {
      const v1: Array<Choreography & { themeId?: string }> = JSON.parse(old);
      if (!v1.length) return;
      const migrTheme: ChoreographyTheme = {
        id:          'migrated-' + Date.now(),
        name:        'Mes chorégraphies (v1)',
        description: 'Données migrées automatiquement',
        emoji:       '🎵',
        isBuiltIn:   false,
      };
      const migrated = v1.map(c => ({ ...c, themeId: migrTheme.id }));
      this._themes.update(list => [...list, migrTheme]);
      this._choreos.update(list => [...list, ...migrated]);
      localStorage.removeItem(LS_KEY_V1);
      this.persistLocal();
      console.info(`[ChoreographyService] ${v1.length} chorégraphies migrées depuis v1 → thème "${migrTheme.name}"`);
    } catch { /* ignore */ }
  }

  private persistLocal(): void {
    try {
      const state: StoredState = { themes: this._themes(), choreos: this._choreos() };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }

  private parseSP(json: string | null | undefined): import('../models/choreography.model').ServoPoint[] {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

  // ── Mise à jour locale synchrone (pour drag canvas) ───────────────────────

  updateLocal(choreo: Choreography): void {
    this._choreos.update(list => list.map(c => c.id === choreo.id ? choreo : c));
    this.persistLocal();
  }

  // ── Persistence distante (appelée après debounce dans l'éditeur) ──────────

  async saveRemote(choreo: Choreography): Promise<void> {
    if (this._source !== 'appsync') return;

    const payload = {
      themeId:         choreo.themeId,
      name:            choreo.name,
      mp3File:         choreo.mp3File || undefined,
      mp3DurationMs:   choreo.mp3DurationMs || undefined,
      servoPointsJson: JSON.stringify(choreo.servoPoints),
    };

    if (this._remoteIds.has(choreo.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).models.ChoreographyRecord.update({ id: choreo.id, ...payload });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).models.ChoreographyRecord.create({ id: choreo.id, ...payload });
      this._remoteIds.add(choreo.id);
    }
  }

  // ── CRUD thèmes ───────────────────────────────────────────────────────────

  async createTheme(data: { name: string; description: string; emoji: string }): Promise<ChoreographyTheme> {
    const id    = crypto.randomUUID();
    const theme: ChoreographyTheme = { id, ...data, isBuiltIn: false };

    if (this._source === 'appsync') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, errors } = await (client as any).models.ChoreographyTheme.create({
        id, ...data, isBuiltIn: false,
      });
      if (errors?.length) throw new Error(errors[0].message);
      theme.id = created.id;
    }

    this._themes.update(list => [...list, theme]);
    this.persistLocal();
    return theme;
  }

  async updateThemeImage(themeId: string, imageS3Key: string): Promise<void> {
    this._themes.update(list =>
      list.map(t => t.id === themeId ? { ...t, imageS3Key } : t)
    );
    this.persistLocal();
    if (this._source === 'appsync') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).models.ChoreographyTheme.update({ id: themeId, imageS3Key });
    }
  }

  // ── CRUD chorégraphies ────────────────────────────────────────────────────

  async createChoreography(themeId: string, name: string): Promise<Choreography> {
    const choreo: Choreography = {
      id: crypto.randomUUID(), themeId, name,
      mp3File: '', mp3DurationMs: 0, servoPoints: [],
    };

    if (this._source === 'appsync') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { errors } = await (client as any).models.ChoreographyRecord.create({
        id: choreo.id, themeId, name, servoPointsJson: '[]',
      });
      if (errors?.length) throw new Error(errors[0].message);
      this._remoteIds.add(choreo.id);
    }

    this._choreos.update(list => [...list, choreo]);
    this.persistLocal();
    return choreo;
  }

  async deleteChoreography(id: string): Promise<void> {
    if (this._source === 'appsync' && this._remoteIds.has(id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).models.ChoreographyRecord.delete({ id });
      this._remoteIds.delete(id);
    }
    this._choreos.update(list => list.filter(c => c.id !== id));
    this.persistLocal();
  }
}
