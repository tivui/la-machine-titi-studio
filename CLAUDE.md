# La Machine Studio — Guide Claude

Application Angular permettant de composer des chorégraphies servo pour "La Machine" (automate Erlang ESP32-C3) et de flasher son firmware via Web Serial.

---

## Stack technique

| Couche | Techno | Version |
|---|---|---|
| Framework | Angular standalone, lazy routing | 20.x |
| Design | Angular Material M3 + Tailwind CSS | 20.x / 4.x |
| Auth | AWS Cognito (Amplify Gen 2) | — |
| API | AWS AppSync (GraphQL) | — |
| Storage | AWS S3 (`images/`, `sounds/`) | — |
| Database | DynamoDB (via Amplify) | — |
| Audio | Web Audio API + lame.js (`@breezystack/lamejs`) | — |
| Flash | Web Serial API (Chrome/Edge uniquement) | — |

---

## Architecture des fichiers

```
src/app/
  app.ts / app.html / app.scss      ← racine, wrapping Amplify authenticator
  app.config.ts                     ← config Angular (provideRouter, provideHttpClient…)
  app.routes.ts                     ← lazy: /library, /editor, /flash
  shell/nav/                        ← sidebar 216px fixe
  features/
    editor/
      editor/editor.ts              ← composant principal, Canvas 2D, lecture audio
      editor/editor.html            ← template (~413 lignes)
      editor/editor.scss            ← styles composant
      models/choreography.model.ts  ← ServoPoint, Choreography, ChoreographyTheme
      services/choreography.service.ts
      utils/erlang-parser.ts        ← parse format Erlang de la_machine
    library/
      library/library.ts
      library/models/image-theme.ts ← ImageTheme, Sound
      services/library.service.ts
    flash/
      flash/flash.ts                ← Web Serial, simulation flash
amplify/
  backend.ts / auth/ / data/ / storage/
scripts/seed-library.ts             ← npm run seed (tsx)
src/styles.scss                     ← design system global
```

---

## Design System

### Hiérarchie chrome → surfaces

- Page chrome (éditeur) : `#EAE6DC` — gris crème foncé
- Fond page général (`--bg-base`) : `#F7F3EB` — crème chaud
- Cartes / canvas (`--bg-card`, `--canvas-bg`) : `#FFFFFF` — blanc pur

Règle : les surfaces doivent être **plus claires** que leur chrome. Ne jamais mettre canvas et page au même ton.

### Variables CSS (`:root` dans `src/styles.scss`)

```scss
// Surfaces
--bg-base:    #F7F3EB;
--bg-sidebar: #FFFFFF;
--bg-card:    #FFFFFF;
--bg-raised:  #F5F2EC;
--bg-input:   #F7F3EB;
--canvas-bg:  #FFFFFF;

// Texte
--tx-1: #120F0A;   // 17:1 sur crème — titres
--tx-2: #4A3D2E;   // 9.5:1 — corps
--tx-3: #5C4E3C;   // 7.0:1 sur blanc — labels WCAG AA ✓
--tx-4: #C0B4A0;   // décoratif uniquement, jamais du texte lisible

// Accent jaune
--yellow:    #FAB900;   // FOND uniquement
--yellow-lt: #FFC830;
--yellow-dk: #7A5200;   // TEXTE accentué (6.9:1 sur blanc) WCAG AA ✓
--orange:    #FAB900;   // alias rétrocompat
--orange-lt: #FFC830;
--orange-dk: #7A5200;

// Autres
--red:     #C42000;
--red-lt:  #E03018;
--green:   #157A3A;
--green-lt:#1FAD52;

// Border radius
--radius-sm: 6px;
--radius-md: 12px;
--radius-lg: 20px;   // cartes standard
--radius-xl: 9999px; // pilule

// Borders
--bd-faint:   1px solid rgba(0,0,0,0.07);
--bd-subtle:  1px solid rgba(0,0,0,0.11);
--bd-default: 1px solid rgba(0,0,0,0.16);
--bd-orange:  1px solid rgba(250,185,0,0.4);
--bd-red:     1px solid rgba(196,32,0,0.25);

// Shadows
--sh-xs: 0 1px 4px rgba(0,0,0,0.08);
--sh-sm: 0 2px 10px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06);
--sh-md: 0 4px 20px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.07);
--sh-lg: 0 8px 36px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.07);
--glow-orange: 0 0 24px rgba(250,185,0,0.18);
--glow-red:    0 0 20px rgba(196,32,0,0.10);
```

### Typographie

- Sans-serif : `Instrument Sans`, Inter, Helvetica Neue (déclarée dans `@theme`)
- Monospace : `Roboto Mono`, Courier New (canvas, métadonnées, code Erlang)
- Base : 14px, line-height 1.5

### Classes utilitaires globales (dans `src/styles.scss`)

- `.app-shell` / `.app-main` — shell flex 100vh
- `.page-title` / `.page-subtitle` / `.section-label`
- `.card-surface` — bg blanc, border subtle, radius-lg, sh-sm, hover jaune
- `.card-surface--red` — variant danger
- `.icon-avatar`, `.icon-avatar--orange`, `.icon-avatar--red`
- `.tag`, `.tag--system`, `.tag--user`
- `.sound-row`, `.sound-row--user`
- `.state-card--success/error/warning`
- `.checklist`, `.check-item`
- `.empty-state`
- `.btn-danger`
- `.divider`

---

## Règles strictes — à ne jamais violer

### Couleurs

1. **`#FAB900` (`--yellow`) = fond uniquement.** Jamais en couleur de texte. Sur fond jaune, le texte est toujours `#120F0A`.
2. **Texte accentué = `--yellow-dk` (`#7A5200`).** Ratio 6.9:1 sur blanc — WCAG AA.
3. **`--tx-4` (`#C0B4A0`) = décoratif uniquement.** Jamais pour du texte lisible.
4. **Pas d'orange.** L'accent de La Machine est jaune (`#FAB900`). Toute référence `orange` dans les noms de variables est un alias rétrocompat → même valeur jaune.
5. **Pas de couleurs hardcodées** sauf rgba/opacity. Toujours utiliser les tokens CSS.
6. **Canvas = light mode.** Toutes les couleurs canvas sont `rgba(0,0,0,...)`, jamais `rgba(255,255,255,...)`. Les tracés waveform sont ambrés (`rgba(160,95,0,...)`, `rgba(185,115,0,...)`).

### WCAG AA minimum (obligatoire)

- Texte normal (< 18px non-gras) : 4.5:1
- Texte grand (≥ 18px ou ≥ 14px gras) : 3:1
- `--tx-3` doit rester ≥ 7:1 sur blanc → ne pas l'éclaircir au-delà de `#5C4E3C`

### CSS — pièges de spécificité

**Problème `.card-surface` vs `.timeline-wrap` :**
`.card-surface` est global (spécificité 0,1,0) mais les styles composant Angular reçoivent un attribut `[_ngcontent-xxx]`, soit 0,2,0 — ils gagnent.
**Solution définitive :** `.timeline-wrap` n'a **pas** la classe `.card-surface` dans le HTML. Ses styles de carte (background, border, border-radius, shadow) sont définis directement dans `.timeline-wrap` dans `editor.scss`.

**Règle générale :** pour tout élément canvas ou data viz dont le border-radius doit différer de `--radius-lg`, ne pas utiliser `.card-surface`. Styler directement.

### Tailwind v4 — `@theme` vs `:root`

Les variables déclarées dans `@theme {}` ne sont **pas** automatiquement exposées comme variables CSS dans les composants SCSS. Elles sont uniquement disponibles via les utilitaires Tailwind (`rounded-sm`, etc.).

**Double déclaration obligatoire :** toute variable utilisée dans un composant SCSS via `var(--...)` doit être déclarée **aussi** dans `:root {}`.

Exemple dans `src/styles.scss` :
```scss
@theme { --radius-sm: 6px; }   // pour Tailwind
:root  { --radius-sm: 6px; }   // pour les composants SCSS
```

---

## Angular — Conventions

### Signaux (Angular 20, zoneless)

- Toujours `signal()`, `computed()`, `effect()` — pas de `BehaviorSubject` ni `Observable` pour l'état local.
- `effect()` dans le `constructor()`, jamais dans `ngOnInit`.
- Signaux internes privés (`_selectedThemeId`) exposés en readonly via `.asReadonly()`.
- `computed()` pour toute dérivation : `choreos`, `current`, `selectedPoint`, `erlangPreview`, etc.

### Composants

- Standalone (pas de `NgModule`).
- Lazy loading via `loadComponent` dans `app.routes.ts`.
- `ViewEncapsulation.Emulated` (défaut) — ne pas changer.
- `@ViewChild` : toujours avec `!` (assertion non-null), vérifier `?.nativeElement` avant usage.

### Services

- `inject()` dans le corps de la classe, pas de constructeur injection.
- Les services font leurs propres appels AppSync. Fallback mock si DynamoDB indisponible.

---

## Canvas Timeline — Conventions

### Constantes (dans `editor.ts`)

```typescript
const RULER_H   = 28;   // règle temporelle
const AUDIO_H   = 52;   // piste audio / waveform
const SERVO_H   = 200;  // zone servo (0-100%)
const SERVO_PAD = 8;    // extension bas — pY(0) circles ne touchent pas le bord
const LEFT_PAD  = 6;    // offset gauche — tX(0) circles ne touchent pas le bord gauche
export const CANVAS_H = 288; // = RULER_H + AUDIO_H + SERVO_H + SERVO_PAD

const DOOR_PCT = 15;    // ligne pointillée "trappe"
const BTN_PCT  = 85;    // ligne pointillée "contact bouton"
const DRAG_R   = 10;    // rayon hit-test drag
```

**Ne pas modifier SERVO_PAD via la formule pY** (compression de l'axe servo = résultat pire). Étendre `CANVAS_H` si besoin.

### Système de coordonnées

```typescript
const tX = (ms: number) => LEFT_PAD + ms / vd * (cssW - LEFT_PAD);
const pY = (pos: number) => RULER_H + AUDIO_H + SERVO_H - (pos / 100 * SERVO_H);
```

- `tX(0)` = 6px (pas 0 — évite le clipping des cercles sur le bord gauche)
- `pY(0)` = 280px, CANVAS_H = 288px → 8px de marge en bas
- `tX` et `pY` calculés en CSS pixels, le canvas est mis à l'échelle `devicePixelRatio`

### devicePixelRatio

```typescript
const dpr  = window.devicePixelRatio || 1;
const cssW = canvas.clientWidth;
const physW = Math.round(cssW * dpr), physH = Math.round(CANVAS_H * dpr);
if (canvas.width !== physW || canvas.height !== physH) { canvas.width = physW; canvas.height = physH; }
ctx.save(); ctx.scale(dpr, dpr);
// toute la logique de dessin en CSS pixels
ctx.restore();
```

### ResizeObserver — init lazy obligatoire

Le canvas peut ne pas être dans le DOM à `ngAfterViewInit` si `current()` est null (pas de chorégraphie sélectionnée). Init dans `drawCanvas()` lui-même :

```typescript
private resizeObserver: ResizeObserver | null = null;

private drawCanvas(): void {
  const canvas = this.canvasRef?.nativeElement;
  if (!canvas) return;
  if (!this.resizeObserver) {
    this.resizeObserver = new ResizeObserver(() =>
      requestAnimationFrame(() => this.drawCanvas())
    );
    this.resizeObserver.observe(canvas);
  }
  // …
}

ngOnDestroy(): void { this.resizeObserver?.disconnect(); }
```

### Couleurs canvas (light mode)

| Élément | Couleur |
|---|---|
| Ruler bg | `rgba(0,0,0,0.04)` |
| Ruler tick major | `rgba(0,0,0,0.30)` |
| Ruler label | `rgba(0,0,0,0.45)` |
| Waveform fond | `rgba(185,115,0,0.18→0.02)` gradient |
| Waveform trace | `rgba(160,95,0,0.65)` |
| Servo path | `rgba(170,100,0,0.55)` |
| Servo point normal | fill `rgba(185,115,0,0.85)`, stroke `rgba(185,115,0,0.45)` |
| Servo point sélectionné | fill `#C88000`, stroke `#7A5200` |
| Ligne trappe (15%) | `rgba(185,115,0,0.35)` pointillés |
| Ligne bouton (85%) | `rgba(180,40,0,0.35)` pointillés |
| Cursor lecture | `#C42000` (playing), `rgba(0,0,0,0.40)` (stopped) |

### Label "0ms" dans la règle

`textAlign:'center'` à `x=0` coupe la moitié du label. Traitement spécial :
```typescript
if (ms === 0) {
  ctx.textAlign = 'left';
  ctx.fillText('0ms', 4, RULER_H - 12);
  ctx.textAlign = 'center';
}
```

### Chemin servo — départ

```typescript
if (i === 0) { ctx.moveTo(tX(0), pY(0)); ctx.lineTo(sx, pY(prevPos)); }
```
Toujours `tX(0)` (pas `0`).

---

## Règles métier firmware

1. **MP3 obligatoirement mono 44.1kHz.** L'éditeur détecte le stéréo et propose la conversion (OfflineAudioContext 1 canal 44100Hz → lame.js MP3 128kbps).
2. **Sons système (`isSystem: true`) toujours présents** dans toute image firmware. Ils ne sont pas sélectionnables dans l'éditeur de chorégraphies.
3. **Image originale Paul Guyot** toujours disponible dans la bibliothèque (`isOriginal: true`).
4. **Fin de scénario obligatoire** — toujours ajoutée à l'export Erlang, non éditable :
   `{servo, 100}, {wait, 300}, {servo, 0, 1500}`
5. **Chemin S3 sons perso** : `sounds/personal/<nom>.mp3`
6. **Flash uniquement Chrome/Edge** (Web Serial API non disponible Firefox/Safari).

---

## Schéma de données (Amplify / DynamoDB)

### ImageTheme
```
id, name, description, buildDate, s3Key, isOriginal, sizeKb
→ hasMany Sound
```

### Sound
```
id, imageThemeId (FK), name, filename, isSystem, durationSec
filename = "personal/xxx.mp3" | "meuh/xxx.mp3" | "_other/xxx.mp3"
```

### ChoreographyTheme
```
id, name, description, emoji, isBuiltIn
→ hasMany ChoreographyRecord
```

### ChoreographyRecord
```
id, themeId (FK), name, description, mp3File, mp3DurationMs, servoPointsJson
servoPointsJson = JSON.stringify(ServoPoint[])
```

### ServoPoint (modèle local, stocké en JSON)
```typescript
{ id: string; timeMs: number; position: number; durationMs: number; }
// position: 0-100%, durationMs: 0 = instantané
```

### Auth
- Mode défaut : `userPool` (Cognito email + password)
- Script seed : `publicApiKey` (clé API 365 jours)

---

## Export Erlang

Format généré par `toErlang()` dans `editor.ts` :
```
{mp3, <<"personal/son.mp3">>}, {wait, 115}, {servo, 19}, {wait, 200}, {servo, 0, 300}, {wait, sound}, {servo, 100}, {wait, 300}, {servo, 0, 1500}
```

- `{wait, sound}` = attendre fin du son (toujours ajouté si mp3File présent)
- `{servo, pos}` = instantané, `{servo, pos, durMs}` = transition lente
- La séquence de fin est **toujours** les 3 derniers tokens

---

## Composant `.timeline-wrap` — détail CSS critique

```scss
// editor.scss — PAS de classe .card-surface dans le HTML
.timeline-wrap {
  position: relative; overflow: hidden; padding: 0; cursor: crosshair;
  background: var(--bg-card);
  border: 1px solid rgba(0,0,0,0.11);
  border-radius: var(--radius-sm); // 6px — data viz, pas 20px comme les cartes
  box-shadow: var(--sh-sm);
  transition: box-shadow 0.18s ease, border-color 0.18s ease;
  &:hover {
    border-color: rgba(250,185,0,0.45);
    box-shadow: var(--sh-md), 0 0 0 3px rgba(250,185,0,0.08);
  }
}

.timeline-canvas {
  display: block; width: 100%; height: 288px;
  image-rendering: crisp-edges;
  background: var(--canvas-bg);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
```

---

## Boutons Material — overrides importants

**Play button** — centrage icône (inline-flex obligatoire, `margin-left` INTERDIT) :
```scss
.play-btn {
  color: var(--green) !important;
  background: rgba(34,197,94,0.08) !important;
  border: 1px solid rgba(34,197,94,0.18) !important;
  border-radius: var(--radius-md) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
```

**Aperçu machine body** — JAUNE, pas orange :
```scss
.machine-body { background: linear-gradient(145deg, var(--yellow-lt), var(--yellow)); }
```

---

## Auto-save

Toute modification de chorégraphie passe par `patchCurrent()` :
1. Sync local immédiat via `svc.updateLocal()` (signal mis à jour, canvas redessine)
2. Remote save débounced 800ms via `svc.saveRemote()`

---

## Raccourcis clavier (éditeur)

| Touche | Action |
|---|---|
| `Espace` | Lecture / Stop |
| `Backspace` / `Delete` | Supprimer le point sélectionné |
| Clic zone servo | Ajouter un point |
| Drag point | Déplacer (x=temps, y=position) |
| Clic zone ruler/audio | Scrub (seek) |

---

## Material M3 — tokens overrides (dans `styles.scss`)

```scss
--mat-sys-primary:           #FAB900;
--mat-sys-on-primary:        #120F0A;
--mat-sys-primary-container: #FFC830;
--mat-sys-secondary:         #C42000;
--mat-sys-on-secondary:      #FFFFFF;
--mat-sys-surface:           #FFFFFF;
--mat-sys-surface-container: #F7F3EB;
--mat-sys-on-surface:        #120F0A;
--mat-sys-background:        #F7F3EB;
```

Palette de base : `mat.$orange-palette` (la plus proche du jaune La Machine).

---

## Pièges connus

| Piège | Cause | Solution |
|---|---|---|
| Variable CSS absente dans composant | Déclarée dans `@theme` seulement | Ajouter aussi dans `:root` |
| `border-radius: 20px` sur timeline | `.card-surface` gagne en spécificité | Ne pas mettre `.card-surface` sur `.timeline-wrap` |
| Canvas ne se redimensionne pas | ResizeObserver initialisé avant que le canvas existe | Init lazy dans `drawCanvas()` |
| Cercles coupés à gauche | `tX(0) = 0`, cercle de r=6 dépasse | `LEFT_PAD = 6` dans la formule `tX` |
| Label "0ms" coupé | `textAlign:'center'` à x=0 | `textAlign:'left'` à x=4 pour ms===0 |
| Compression axe servo | Absorber SERVO_PAD dans la formule `pY` | Étendre `CANVAS_H` de SERVO_PAD (ne pas modifier `pY`) |
| Icône play non centrée | `margin-left` sur l'icône | `display:inline-flex; align-items:center; justify-content:center` sur le bouton |
| Texte jaune illisible | `#FAB900` = 1.6:1 sur fond clair | Texte accentué = `--yellow-dk` (#7A5200) |
| `--tx-3` WCAG fail | Valeur trop claire (ex: #8A7968 = 3.78:1) | Garder à `#5C4E3C` (7:1) |

---

## Développement local

```bash
# Démarrer le sandbox Amplify (DynamoDB + S3 local)
npx amplify sandbox

# Démarrer le frontend
ng serve

# Seed la base de données
npm run seed
```

Flash ESP32 : `scripts/flash.ps1` (PowerShell, COM3, firmware en `.img`)
