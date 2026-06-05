import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LibraryService } from '../services/library.service';
import { ImageTheme } from '../models/image-theme';

@Component({
  selector: 'app-library',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {
  private service = inject(LibraryService);
  private router = inject(Router);

  loading = this.service.loading;
  originalImage = computed(() => this.service.images().find(i => i.isOriginal));
  customImages = computed(() => this.service.images().filter(i => !i.isOriginal));
  totalSounds = computed(() => this.service.images().reduce((acc, img) => acc + img.sounds.filter(s => !s.isSystem).length, 0));

  flash(image: ImageTheme) {
    this.router.navigate(['/flash'], { queryParams: { imageId: image.id } });
  }

  restore() {
    const orig = this.originalImage();
    if (orig) this.flash(orig);
  }

  formatSize(kb?: number): string {
    if (!kb) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
