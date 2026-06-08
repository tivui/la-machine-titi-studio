import { Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { getUrl } from 'aws-amplify/storage';
import { LibraryService } from '../services/library.service';
import { BuildService } from '../services/build.service';
import { ChoreographyService } from '../../editor/services/choreography.service';
import { ImageTheme } from '../models/image-theme';
import { ChoreographyTheme } from '../../editor/models/choreography.model';

@Component({
  selector: 'app-library',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library implements OnInit {
  @ViewChild('soundImportInput') private soundImportRef!: ElementRef<HTMLInputElement>;

  private service   = inject(LibraryService);
  private buildSvc  = inject(BuildService);
  private choreoSvc = inject(ChoreographyService);
  private router    = inject(Router);
  private snackBar  = inject(MatSnackBar);

  loading       = this.service.loading;
  originalImage = computed(() => this.service.images().find(i => i.isOriginal));
  customImages  = computed(() => this.service.images().filter(i => !i.isOriginal));
  totalSounds   = computed(() => this.service.images().reduce((acc, img) => acc + img.sounds.filter(s => !s.isSystem).length, 0));

  themes         = this.choreoSvc.themes;
  buildJobs      = this.buildSvc.jobs;
  buildLoading   = this.buildSvc.loading;

  // Thèmes custom (non built-in) avec leurs chorégraphies
  customThemes = computed(() => this.choreoSvc.themes().filter(t => !t.isBuiltIn));

  // Map themeId → image la plus récente buildée
  imageByTheme = computed(() => {
    const map = new Map<string, ImageTheme>();
    for (const img of this.service.images()) {
      if (!img.choreographyThemeId) continue;
      const existing = map.get(img.choreographyThemeId);
      if (!existing || img.buildDate > existing.buildDate) {
        map.set(img.choreographyThemeId, img);
      }
    }
    return map;
  });

  importing       = signal(false);
  buildingId      = signal<string | null>(null);
  themeImageUrls  = signal<Map<string, string>>(new Map());

  constructor() {
    // Charger les URLs d'images signées quand les thèmes changent
    effect(() => {
      const themes = this.customThemes().filter(t => t.imageS3Key);
      if (themes.length > 0) this.loadThemeImageUrls(themes);
    });
  }

  private async loadThemeImageUrls(themes: ChoreographyTheme[]): Promise<void> {
    const entries = await Promise.all(
      themes.map(async t => {
        try {
          const { url } = await getUrl({ path: t.imageS3Key! });
          return [t.id, url.toString()] as [string, string];
        } catch { return null; }
      })
    );
    this.themeImageUrls.update(prev => {
      const next = new Map(prev);
      for (const e of entries) { if (e) next.set(e[0], e[1]); }
      return next;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.buildSvc.loadJobs();
    // Démarrer le polling si des builds actifs existent
    if (this.buildSvc.activeJobs().length > 0) {
      this.buildSvc.startPolling();
    }
  }

  goToEditor(): void {
    this.router.navigate(['/editor']);
  }

  // ── Actions images ──────────────────────────────────────────────────────────

  flash(image: ImageTheme): void {
    this.router.navigate(['/flash'], { queryParams: { imageId: image.id } });
  }

  restore(): void {
    const orig = this.originalImage();
    if (orig) this.flash(orig);
  }

  reload(): void {
    this.service.reload();
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  async buildImage(theme: ChoreographyTheme): Promise<void> {
    const choreos = this.choreoSvc.choreos().filter(c => c.themeId === theme.id);
    if (choreos.length === 0) {
      this.snackBar.open('Aucune chorégraphie dans ce thème. Créez-en depuis l\'éditeur.', 'OK', { duration: 5000 });
      return;
    }

    this.buildingId.set(theme.id);
    try {
      const { workflowUrl } = await this.buildSvc.triggerBuild(theme, choreos);
      this.snackBar.open(
        `Build lancé pour "${theme.name}" ✓`,
        'Voir sur GitHub',
        { duration: 8000 },
      ).onAction().subscribe(() => window.open(workflowUrl, '_blank'));
    } catch (err) {
      this.snackBar.open(
        `Erreur : ${err instanceof Error ? err.message : String(err)}`,
        'OK',
        { duration: 10000 },
      );
    } finally {
      this.buildingId.set(null);
    }
  }

  latestBuildForTheme(themeId: string) {
    return this.buildSvc.latestJobForTheme(themeId);
  }

  buildStatusLabel(themeId: string): string {
    const job = this.latestBuildForTheme(themeId);
    if (!job) return '';
    switch (job.status) {
      case 'queued':  return 'En file d\'attente…';
      case 'running': return 'Build en cours (~10 min)…';
      case 'success': return 'Image prête ✓';
      case 'failed':  return 'Build échoué';
      default:        return '';
    }
  }

  openWorkflowRun(themeId: string): void {
    const job = this.latestBuildForTheme(themeId);
    if (!job?.workflowRunId) return;
    window.open(`https://github.com/tivui/la-machine-titi/actions/runs/${job.workflowRunId}`, '_blank');
  }

  // ── Sons ────────────────────────────────────────────────────────────────────

  triggerSoundImport(): void {
    this.soundImportRef.nativeElement.click();
  }

  async onSoundImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    this.importing.set(true);
    try {
      const result = await this.service.importSound(file);
      if (result.success) {
        this.snackBar.open(
          `"${file.name}" importé (${result.durationSec ? result.durationSec.toFixed(1) + 's' : ''}) ✓`,
          undefined, { duration: 4000 },
        );
      } else {
        this.snackBar.open(result.error ?? 'Erreur inconnue.', 'OK', { duration: 8000 });
      }
    } finally {
      this.importing.set(false);
    }
  }

  // ── Utils ───────────────────────────────────────────────────────────────────

  choreoCount(themeId: string): number {
    return this.choreoSvc.choreos().filter(c => c.themeId === themeId).length;
  }

  formatSize(kb?: number): string {
    if (!kb) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  formatDate(date?: Date): string {
    if (!date) return '';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
