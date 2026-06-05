/**
 * Seed DynamoDB avec les données initiales de La Machititine.
 * Prérequis : sandbox Amplify actif + amplify_outputs.json à jour avec la clé API.
 *
 * Usage : npm run seed
 */
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);

// Le seed utilise les credentials AWS du profil local (admin) via IAM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = generateClient<any>({ authMode: 'iam' });

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
      { name: 'joy_01 · Champions League', filename: 'champions_league.mp3',  isSystem: false, durationSec: 19.4  },
      { name: 'joy_02 · Allez Paris',      filename: 'allez_paris.mp3',       isSystem: false, durationSec: 22.26 },
    ],
  },
];

// ─── Script ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 La Machititine Studio — Seed DynamoDB\n');

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

  console.log('✅ Seed terminé ! Rechargez http://localhost:4200');
}

seed().catch(err => {
  console.error('\n❌ Erreur seed :', err.message ?? err);
  console.error('   Vérifiez que le sandbox est actif et que amplify_outputs.json contient une clé API.');
  process.exit(1);
});
