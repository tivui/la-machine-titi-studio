/**
 * Seed DynamoDB avec les données initiales de La Machititine.
 * Prérequis : sandbox Amplify actif + amplify_outputs.json à jour avec la clé API.
 *
 * Usage : npm run seed
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = generateClient<any>({ authMode: 'apiKey' });

const S3_BUCKET  = outputs.storage.bucket_name;
const S3_REGION  = outputs.storage.aws_region;
const s3Client   = new S3Client({ region: S3_REGION });

// Sons à uploader depuis ../la_machine/sounds/ vers S3
const LA_MACHINE = resolve(process.cwd(), '..', 'la_machine', 'sounds');
const SOUNDS_S3: Array<{ src: string; key: string }> = [
  { src: resolve(LA_MACHINE, 'personal', 'champions-league.mp3'), key: 'sounds/personal/champions-league.mp3' },
  { src: resolve(LA_MACHINE, 'personal', 'allezparis.mp3'),        key: 'sounds/personal/allezparis.mp3'        },
  { src: resolve(LA_MACHINE, 'meuh',     '03676.mp3'),             key: 'sounds/meuh/03676.mp3'                 },
  { src: resolve(LA_MACHINE, '_other',   '00043.mp3'),             key: 'sounds/_other/00043.mp3'               },
];

// ─── Données de seed ──────────────────────────────────────────────────────────

const THEMES = [
  {
    theme: {
      name: 'Original Paul Guyot',
      description: "Firmware officiel de La Machine. Tous les sons d'origine, inchangés.",
      buildDate: new Date('2024-01-01').toISOString(),
      s3Key: 'images/la_machine_original.img',
      isOriginal: true,
      sizeKb: 1024,
    },
    sounds: [
      { name: 'batterylow', filename: '_system/batterylow.mp3', isSystem: true },
      { name: 'welcome',    filename: '_system/welcome.mp3',    isSystem: true },
    ],
  },
  {
    theme: {
      name: 'La Machititine — Mes sons',
      description: 'Image personnalisée avec les chorégraphies Champions League et Allez Paris.',
      buildDate: new Date('2025-12-01').toISOString(),
      s3Key: 'images/la_machititine_v1.img',
      isOriginal: false,
      sizeKb: 4096,
    },
    sounds: [
      { name: 'batterylow',               filename: '_system/batterylow.mp3', isSystem: true  },
      { name: 'welcome',                   filename: '_system/welcome.mp3',    isSystem: true  },
      { name: 'joy_01 · Champions League', filename: 'personal/champions-league.mp3', isSystem: false, durationSec: 19.4  },
      { name: 'joy_02 · Allez Paris',      filename: 'personal/allezparis.mp3',      isSystem: false, durationSec: 22.26 },
    ],
  },
];

// ─── Parser Erlang (inline — pas de dépendance DOM) ───────────────────────────

interface ServoPoint { id: string; timeMs: number; position: number; durationMs: number; }

function parseErlang(def: string): { servoPoints: ServoPoint[]; mp3File: string } {
  const tokens: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < def.length; i++) {
    if (def[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (def[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) { tokens.push(def.slice(start, i + 1)); start = -1; }
    }
  }
  // Supprimer séquence de fin
  let endIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].trim() === '{servo, 0, 1500}') { endIdx = i; break; }
  }
  if (endIdx >= 2 && tokens[endIdx - 1].trim() === '{wait, 300}' && tokens[endIdx - 2].trim() === '{servo, 100}') {
    tokens.splice(endIdx - 2, 3);
  }
  let cursor = 0; let mp3File = '';
  const servoPoints: ServoPoint[] = [];
  for (const token of tokens) {
    const inner = token.slice(1, -1).trim();
    const ci = inner.indexOf(',');
    const cmd = ci >= 0 ? inner.slice(0, ci).trim() : inner.trim();
    if (cmd === 'servo') {
      const args = inner.slice(ci + 1).trim().split(',').map((s: string) => s.trim());
      const pos = parseInt(args[0]); const dur = args[1] ? parseInt(args[1]) : 0;
      if (!isNaN(pos)) servoPoints.push({ id: randomUUID(), timeMs: cursor, position: pos, durationMs: isNaN(dur) ? 0 : dur });
    } else if (cmd === 'wait') {
      const arg = inner.slice(ci + 1).trim();
      if (arg !== 'sound') { const ms = parseInt(arg); if (!isNaN(ms)) cursor += ms; }
    } else if (cmd === 'mp3') {
      const m = inner.match(/<<"([^"]+)">>/); if (m) mp3File = m[1];
    }
  }
  return { servoPoints, mp3File };
}

// ─── Données de seed chorégraphies ────────────────────────────────────────────

const CHOREO_THEMES = [
  { name: 'Original Paul Guyot', description: 'Chorégraphies du firmware original de La Machine', emoji: '🎭', isBuiltIn: true },
  { name: 'PSG',                 description: 'Chorégraphies personnalisées PSG', emoji: '⚽', isBuiltIn: false },
];

const CHOREO_DEFS: Array<{ themeName: string; name: string; def: string }> = [
  { themeName: 'Original Paul Guyot', name: 'calling_silent',
    def: '{servo, 19}, {wait, 115}, {servo, 0}, {wait, 116}, {servo, 19}, {wait, 122}, {servo, 0}' },
  { themeName: 'Original Paul Guyot', name: 'calling_silent2',
    def: '{servo, 10, 80}, {wait, 98}, {servo, 0}, {wait, 105}, {servo, 10}, {wait, 88}, {servo, 0}, {wait, 104}, {servo, 10}, {wait, 89}, {servo, 0}, {wait, 88}, {servo, 10}, {wait, 89}, {servo, 0}, {wait, 94}, {servo, 10}, {wait, 83}, {servo, 0}' },
  { themeName: 'Original Paul Guyot', name: 'calling_silent3',
    def: '{wait, 5}, {servo, 11, 1000}, {wait, 1010}, {servo, 0, 980}' },
  { themeName: 'Original Paul Guyot', name: 'meuh_03676',
    def: '{servo, 60, 2500}, {wait, 1000}, {mp3, <<"meuh/03676.mp3">>}, {wait, 4754}, {servo, 0, 800}' },
  { themeName: 'Original Paul Guyot', name: 'system_batterylow',
    def: '{mp3, <<"_other/00043.mp3">>}, {wait, 578}, {servo, 100, 4480}, {wait, 4400}, {mp3, <<"_other/00043.mp3">>}, {wait, 438}, {servo, 0, 3600}' },
  { themeName: 'Original Paul Guyot', name: 'system_welcome',
    def: '{servo, 50, 360}, {wait, 401}, {servo, 43}, {wait, 3}, {mp3, <<"joy/02110.mp3">>}, {wait, 142}, {servo, 52}, {wait, 146}, {servo, 42}, {wait, 276}, {servo, 67}, {wait, 422}, {servo, 81, 360}, {wait, 386}, {servo, 49, 320}, {wait, 359}, {servo, 52}, {wait, 31}, {servo, 46}, {wait, 42}, {servo, 52}, {wait, 42}, {servo, 45, 80}, {wait, 31}, {servo, 52}, {wait, 73}, {servo, 54}, {wait, 47}, {servo, 46}, {wait, 52}, {servo, 54}, {wait, 52}, {servo, 47}, {wait, 83}, {servo, 38, 520}, {wait, 547}, {servo, 76}, {wait, 66}, {mp3, <<"joy/02220.mp3">>}, {wait, 200}, {servo, 46, 620}, {wait, 656}, {servo, 77}, {wait, 479}, {servo, 79}, {wait, 42}, {servo, 73}, {wait, 36}, {servo, 78}, {wait, 37}, {servo, 73}, {wait, 41}, {servo, 79}, {wait, 63}, {servo, 72}, {wait, 62}, {servo, 79}, {wait, 52}, {servo, 73}, {wait, 58}, {servo, 80}, {wait, 57}, {servo, 73}, {wait, 36}, {servo, 78}, {wait, 47}, {servo, 71}, {wait, 52}, {servo, 78}, {wait, 360}, {servo, 32, 860}, {wait, 869}, {servo, 41, 80}, {wait, 52}, {mp3, <<"joy/02275.mp3">>}, {wait, 115}, {servo, 28}, {wait, 125}, {servo, 57}, {wait, 214}, {servo, 49}, {wait, 109}, {servo, 42}, {wait, 68}, {servo, 35}, {wait, 125}, {servo, 29}, {wait, 135}, {servo, 60}, {wait, 453}, {servo, 53}, {wait, 89}, {servo, 44}, {wait, 146}, {servo, 36}, {wait, 104}, {servo, 27}, {wait, 114}, {servo, 17}, {wait, 183}, {servo, 6}, {wait, 182}, {servo, 100}, {wait, 500}, {mp3, <<"hits/00247.mp3">>}, {wait, 203}, {servo, 0}' },
  { themeName: 'PSG', name: 'joy_01',
    def: '{servo, 0}, {mp3, <<"personal/champions-league.mp3">>}, {wait, 1000}, {servo, 20, 1000}, {wait, 1200}, {servo, 55, 800}, {wait, 1000}, {servo, 70}, {wait, 800}, {servo, 35, 400}, {wait, 500}, {servo, 85, 800}, {wait, 1000}, {servo, 95}, {wait, 900}, {servo, 60, 500}, {wait, 700}, {servo, 75}, {wait, 1000}, {servo, 80}, {wait, 1200}, {servo, 70, 400}, {wait, 600}, {servo, 85}, {wait, 700}, {servo, 45, 600}, {wait, 800}, {servo, 70}, {wait, 800}, {servo, 82}, {wait, 700}, {servo, 0, 400}, {wait, 500}, {servo, 100}, {wait, 1200}, {servo, 90}, {wait, 2500}, {servo, 65, 1500}, {wait, sound}, {servo, 100}, {wait, 300}, {servo, 0, 1500}' },
  { themeName: 'PSG', name: 'joy_02',
    def: '{servo, 0}, {mp3, <<"personal/allezparis.mp3">>}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 7}, {wait, 80}, {servo, 23}, {wait, 80}, {servo, 95}, {wait, 500}, {servo, 85}, {wait, 400}, {servo, 95}, {wait, 400}, {servo, 88}, {wait, 400}, {servo, 35, 400}, {wait, 500}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 5}, {wait, 125}, {servo, 13}, {wait, 125}, {servo, 95}, {wait, 400}, {servo, 100}, {wait, 600}, {servo, 90}, {wait, 400}, {servo, 100}, {wait, 400}, {servo, 88}, {wait, 400}, {servo, 55, 1000}, {wait, sound}, {servo, 100}, {wait, 300}, {servo, 0, 1500}' },
];

// ─── Upload sons S3 ──────────────────────────────────────────────────────────

async function seedSounds(): Promise<void> {
  console.log('🎵 Upload sons vers S3\n');
  for (const sound of SOUNDS_S3) {
    if (!existsSync(sound.src)) {
      console.warn(`  ⚠ Fichier introuvable localement : ${sound.src}`);
      continue;
    }
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: sound.key }));
      console.log(`  ✓ Déjà en S3 : ${sound.key}`);
      continue;
    } catch {
      // N'existe pas encore, on upload
    }
    const body = readFileSync(sound.src);
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: sound.key,
      Body: body,
      ContentType: 'audio/mpeg',
    }));
    console.log(`  ✓ Uploadé : ${sound.key}  (${Math.round(body.length / 1024)} KB)`);
  }
}

// ─── Script ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 La Machititine Studio — Seed DynamoDB\n');

  await seedSounds();
  console.log('');

  // Vérification : évite les doublons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (client as any).models.ImageTheme.list();
  if (existing.length > 0) {
    console.log(`ℹ️  ${existing.length} image(s) déjà présente(s) dans DynamoDB.`);
    console.log('   Seed annulé pour éviter les doublons.');
    console.log('   Pour re-seeder : supprimez les items depuis la console AWS DynamoDB, puis relancez.');
    return;
  }

  for (const entry of THEMES) {
    // Créer l'ImageTheme
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, errors } = await (client as any).models.ImageTheme.create(entry.theme);
    if (errors?.length) throw new Error(`Erreur ImageTheme: ${errors[0].message}`);
    console.log(`  ✓ ${created.name}  (id: ${created.id})`);

    // Créer les Sons associés
    for (const sound of entry.sounds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { errors: se } = await (client as any).models.Sound.create({
        imageThemeId: created.id,
        ...sound,
      });
      if (se?.length) throw new Error(`Erreur Sound "${sound.name}": ${se[0].message}`);
      console.log(`    ✓ ${sound.isSystem ? '⚙' : '♪'} ${sound.name}`);
    }
    console.log('');
  }

  // ── Chorégraphies ────────────────────────────────────────────────────────────
  console.log('\n📚 Seed bibliothèque de chorégraphies\n');

  // Vérification doublons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingThemes } = await (client as any).models.ChoreographyTheme.list();
  if (existingThemes.length > 0) {
    console.log(`ℹ️  ${existingThemes.length} thème(s) de chorégraphies déjà présent(s). Seed chorégraphies ignoré.`);
  } else {
    // Créer les thèmes et indexer par nom
    const themeIdByName: Record<string, string> = {};
    for (const t of CHOREO_THEMES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ct, errors: te } = await (client as any).models.ChoreographyTheme.create(t);
      if (te?.length) throw new Error(`Erreur thème "${t.name}": ${te[0].message}`);
      themeIdByName[t.name] = ct.id;
      console.log(`  ✓ Thème "${t.emoji} ${t.name}"  (id: ${ct.id})`);
    }

    // Créer les chorégraphies
    for (const def of CHOREO_DEFS) {
      const themeId = themeIdByName[def.themeName];
      if (!themeId) { console.warn(`  ⚠ Thème introuvable : "${def.themeName}"`); continue; }
      const { servoPoints, mp3File } = parseErlang(def.def);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { errors: ce } = await (client as any).models.ChoreographyRecord.create({
        id: randomUUID(),
        themeId,
        name: def.name,
        mp3File: mp3File || undefined,
        servoPointsJson: JSON.stringify(servoPoints),
      });
      if (ce?.length) throw new Error(`Erreur chorégraphie "${def.name}": ${ce[0].message}`);
      console.log(`    ✓ ${def.name}  (${servoPoints.length} points${mp3File ? ', ♪ ' + mp3File : ''})`);
    }
  }

  console.log('\n✅ Seed terminé ! Rechargez http://localhost:4200');
}

seed().catch(err => {
  console.error('\n❌ Erreur seed :', err.message ?? err);
  console.error('   Vérifiez que le sandbox est actif et que amplify_outputs.json contient une clé API.');
  process.exit(1);
});
