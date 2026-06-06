import { Injectable, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { uploadData } from 'aws-amplify/storage';
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
      { name: 'joy_01 · Champions League', filename: 'personal/champions-league.mp3', isSystem: false, durationSec: 19.4  },
      { name: 'joy_02 · Allez Paris',      filename: 'personal/allezparis.mp3',      isSystem: false, durationSec: 22.26 },
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
          'id', 'name', 'description', 'buildDate', 's3Key', 'isOriginal', 'sizeKb', 'choreographyThemeId',
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
        choreographyThemeId: t.choreographyThemeId ?? undefined,
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
        console.info('[LibraryService] DynamoDB vide — mock actif (npm run seed pour peupler)');
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

  // ── Import d'un son MP3 ─────────────────────────────────────────────────────
  // Valide mono, upload S3, crée le record DynamoDB (ou met à jour le mock).

  async importSound(file: File): Promise<{ success: boolean; error?: string; durationSec?: number }> {
    // 1. Valider mono via WebAudio
    const audioCtx = new AudioContext();
    let channels = 1, durationSec = 0;
    try {
      const decoded = await audioCtx.decodeAudioData(await file.arrayBuffer());
      channels    = decoded.numberOfChannels;
      durationSec = decoded.duration;
    } catch {
      return { success: false, error: 'Fichier MP3 invalide ou corrompu.' };
    } finally {
      await audioCtx.close();
    }

    if (channels !== 1) {
      return {
        success: false,
        error: `Fichier stéréo (${channels} canaux). Convertissez en mono :\nffmpeg -i input.mp3 -ac 1 output.mp3`,
      };
    }

    const filename = `personal/${file.name}`;
    const soundName = file.name.replace(/\.mp3$/i, '').replace(/[-_]/g, ' ');

    // 2. Upload S3
    try {
      await uploadData({
        path: `sounds/${filename}`,
        data: file,
        options: { contentType: 'audio/mpeg' },
      }).result;
    } catch (e) {
      if (this._source() !== 'mock') {
        return { success: false, error: `Erreur S3 : ${e instanceof Error ? e.message : String(e)}` };
      }
      console.warn('[LibraryService] S3 indisponible, ajout en mock uniquement');
    }

    const newSound: Sound = { name: soundName, filename, isSystem: false, durationSec };

    // 3a. Mode mock : ajoute directement dans le state
    if (this._source() === 'mock') {
      this._images.update(imgs => {
        const idx = imgs.findIndex(i => !i.isOriginal);
        if (idx < 0) return imgs;
        return imgs.map((img, i) => i === idx ? { ...img, sounds: [...img.sounds, newSound] } : img);
      });
      return { success: true, durationSec };
    }

    // 3b. Mode AppSync : créer le record DynamoDB
    const targetImage = this._images().find(i => !i.isOriginal);
    if (!targetImage) {
      return { success: false, error: 'Aucune image personnalisée. Créez-en une d\'abord.' };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).models.Sound.create({
        imageThemeId: targetImage.id,
        name:         soundName,
        filename,
        isSystem:     false,
        durationSec,
      });
      await this.reload();
      return { success: true, durationSec };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
