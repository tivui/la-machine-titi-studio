import { Injectable, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { ImageTheme, Sound } from '../models/image-theme';

// Client Cognito userPool — tokens auto-rafraîchis, aucune expiration à gérer.
// On n'importe pas Schema depuis amplify/ pour éviter les conflits de tsconfig.
// La forme des données est garantie par le mapping typé ci-dessous.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = generateClient<any>();

const MOCK_IMAGES: ImageTheme[] = [
  {
    id: 'original',
    name: 'Original Paul Guyot',
    description: "Firmware officiel de La Machine. Tous les sons d'origine, inchangés.",
    buildDate: new Date('2024-01-01'),
    sounds: [
      { name: 'batterylow', filename: '_system/batterylow.mp3', isSystem: true },
      { name: 'welcome',    filename: '_system/welcome.mp3',    isSystem: true },
    ],
    s3Key: 'images/la_machine_original.img',
    isOriginal: true,
    sizeKb: 1024,
  },
  {
    id: 'machititine-v1',
    name: 'La Machititine — Mes sons',
    description: 'Image personnalisée avec les chorégraphies Champions League et Allez Paris.',
    buildDate: new Date('2025-12-01'),
    sounds: [
      { name: 'batterylow',               filename: '_system/batterylow.mp3',  isSystem: true },
      { name: 'welcome',                   filename: '_system/welcome.mp3',     isSystem: true },
      { name: 'joy_01 · Champions League', filename: 'champions_league.mp3',   isSystem: false, durationSec: 19.4 },
      { name: 'joy_02 · Allez Paris',      filename: 'allez_paris.mp3',        isSystem: false, durationSec: 22.26 },
    ],
    s3Key: 'images/la_machititine_v1.img',
    isOriginal: false,
    sizeKb: 4096,
  },
];

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly _images  = signal<ImageTheme[]>([]);
  private readonly _loading = signal(true);
  private readonly _source  = signal<'appsync' | 'mock'>('mock');

  readonly images  = this._images.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly source  = this._source.asReadonly();

  constructor() {
    this.loadImages();
  }

  async reload(): Promise<void> {
    await this.loadImages();
  }

  private async loadImages(): Promise<void> {
    this._loading.set(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: themes, errors } = await (client as any).models.ImageTheme.list({
        selectionSet: [
          'id', 'name', 'description', 'buildDate', 's3Key', 'isOriginal', 'sizeKb',
          'sounds.id', 'sounds.name', 'sounds.filename', 'sounds.isSystem', 'sounds.durationSec',
        ],
      });

      if (errors?.length) throw new Error(errors[0].message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: ImageTheme[] = (themes ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? '',
        buildDate: t.buildDate ? new Date(t.buildDate) : new Date(),
        s3Key: t.s3Key,
        isOriginal: t.isOriginal ?? false,
        sizeKb: t.sizeKb ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sounds: (t.sounds ?? []).map((s: any): Sound => ({
          name:        s.name,
          filename:    s.filename,
          isSystem:    s.isSystem ?? false,
          durationSec: s.durationSec ?? undefined,
        })),
      }));

      // Original en tête, puis tri par date décroissante
      mapped.sort((a, b) => {
        if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
        return b.buildDate.getTime() - a.buildDate.getTime();
      });

      if (mapped.length === 0) {
        console.warn(
          '[LibraryService] DynamoDB vide — utilisation du mock.\n' +
          '  → Lancez: npm run seed'
        );
        this._images.set(MOCK_IMAGES);
        this._source.set('mock');
      } else {
        this._images.set(mapped);
        this._source.set('appsync');
        console.info(`[LibraryService] ${mapped.length} image(s) chargée(s) depuis AppSync ✓`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[LibraryService] AppSync indisponible, fallback mock:', msg);
      this._images.set(MOCK_IMAGES);
      this._source.set('mock');
    } finally {
      this._loading.set(false);
    }
  }
}
