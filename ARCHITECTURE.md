# La Machine Titi Studio — Architecture

Application web Angular 20 pour gérer "La Machititine" (ESP32-C3, La Machine de Paul Guyot).

## Deux projets liés

```
la_machine/                          la-machine-studio/
(Erlang firmware)                    (Angular web app)
    |                                    |
    | custom/mes_sons branch             | main branch
    | → tivui/la-machine-titi            | → tivui/la-machine-titi-studio
    |                                    |
    | GitHub Actions CI                  |
    | → la_machine.img                   |
    |         |                          |
    |         └──── upload S3 ──────────►|
    |                                    | bibliothèque, flash, éditeur
    |◄─────── génère choreographies.json─|
```

## Stack

| Couche | Techno |
|---|---|
| Frontend | Angular 20, standalone components, lazy routing |
| Design | Angular Material M3 + Tailwind CSS v4 |
| Auth | AWS Cognito (via Amplify Gen 2) |
| API | AWS AppSync GraphQL |
| Storage | AWS S3 (images .img, sons MP3) |
| Base de données | DynamoDB (métadonnées thèmes, images, sons) |
| Flash | ESP Web Tools — Web Serial API (Chrome/Edge) |
| Analyse audio | AWS Lambda Python (amplitude MP3) |

## Branding La Machine

```scss
--color-machine-orange: #F07800;  // corps de la boîte → primary
--color-machine-red:    #CC2200;  // bouton sphère → accent/CTA
--color-machine-black:  #1C1C1C;  // dessus/capot → surfaces, nav
```

## Routes

- `/library` — Bibliothèque des images (thèmes, sons, flash)
- `/flash`   — Flash direct via Web Serial API
- `/editor`  — Éditeur timeline audio + servo

## Règles métier

1. **MP3 obligatoirement mono 44.1kHz** — validé avant tout upload
2. **Sons système toujours présents** — `_system/` (battery low + welcome) dans toute image
3. **Image originale** — image Paul Guyot toujours disponible sur S3 (bouton "Restaurer")
4. **Fin de scénario** — tout scénario finit par `{servo, 100}, {wait, 300}, {servo, 0, 1500}`
5. **Flash Chrome/Edge uniquement** — Web Serial API pas supporté Firefox/Safari

## Firmware (la_machine)

- **Dossier** : `C:\Users\Asus\Documents\Projets\LAMACHINE\la_machine`
- **Branche custom** : `custom/mes_sons`
- **Sons perso** : `sounds/personal/` (mono 44.1kHz)
- **Chorégraphies** : `choreographies.json`
  - `joy_01` : Champions League (~19.4s, synchronisé sur amplitude)
  - `joy_02` : Allez Paris (~22.26s, tremblements sur silences)
- **Flash local** : `flash.ps1` (COM3, esptool, bouton rouge)
- **CI** : GitHub Actions → `la_machine.img` (build ~40min, queue GitHub)

## OTA WiFi (Phase 3)

ESP32-C3 a le WiFi intégré — aucun composant à rajouter.
À implémenter : module Erlang WiFi + auto-check S3 au démarrage (quand USB branché).
