import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { LibraryService } from '../services/library.service';
import { ImageTheme } from '../models/image-theme';

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
export class Library {
  @ViewChild('soundImportInput') private soundImportRef!: ElementRef<HTMLInputElement>;

  private service  = inject(LibraryService);
  private router   = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading       = this.service.loading;
  originalImage = computed(() => this.service.images().find(i => i.isOriginal));
  customImages  = computed(() => this.service.images().filter(i => !i.isOriginal));
  totalSounds   = computed(() => this.service.images().reduce((acc, img) => acc + img.sounds.filter(s => !s.isSystem).length, 0));

  importing = signal(false);

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

  formatSize(kb?: number): string {
    if (!kb) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
