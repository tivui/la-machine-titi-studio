import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LibraryService } from '../../library/services/library.service';

type FlashState = 'ready' | 'connecting' | 'flashing' | 'success' | 'error';

@Component({
  selector: 'app-flash',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './flash.html',
  styleUrl: './flash.scss',
})
export class Flash {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private libraryService = inject(LibraryService);

  private imageId = toSignal(this.route.queryParams.pipe(map(p => p['imageId'] as string | undefined)));

  selectedImage = computed(() => {
    const id = this.imageId();
    return id ? this.libraryService.images().find(i => i.id === id) ?? null : null;
  });

  readonly isWebSerialSupported = 'serial' in navigator;

  state = signal<FlashState>('ready');
  progress = signal(0);
  statusMessage = signal('');
  errorMessage = signal('');

  async connectAndFlash() {
    if (!this.isWebSerialSupported) return;

    this.state.set('connecting');
    this.progress.set(0);
    this.errorMessage.set('');
    this.statusMessage.set('Sélection du port série…');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });

      this.state.set('flashing');
      this.statusMessage.set('Connexion à La Machititine…');

      // TODO: Intégrer esptool-js ici pour flasher le firmware depuis S3
      // 1. Récupérer l'URL S3 de l'image sélectionnée
      // 2. Télécharger le binaire .img
      // 3. Écrire via Web Serial (protocol esptool)
      await this.simulateFlash();

      await port.close();
      this.state.set('success');
      this.statusMessage.set('Firmware flashé avec succès !');
    } catch (err: unknown) {
      const domErr = err as DOMException;
      if (domErr?.name === 'NotFoundError') {
        // Utilisateur a annulé la sélection du port
        this.state.set('ready');
      } else {
        this.errorMessage.set(domErr?.message ?? 'Erreur inconnue');
        this.state.set('error');
      }
    }
  }

  formatSize(kb?: number): string {
    if (!kb) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  reset() {
    this.state.set('ready');
    this.progress.set(0);
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  goToLibrary() {
    this.router.navigate(['/library']);
  }

  private async simulateFlash(): Promise<void> {
    const steps = [
      { pct: 5,  msg: 'Détection de la puce ESP32-C3…' },
      { pct: 15, msg: 'Effacement de la flash…' },
      { pct: 30, msg: 'Écriture du firmware… (0%)' },
      { pct: 50, msg: 'Écriture du firmware… (25%)' },
      { pct: 70, msg: 'Écriture du firmware… (50%)' },
      { pct: 85, msg: 'Écriture du firmware… (75%)' },
      { pct: 95, msg: 'Vérification du firmware…' },
      { pct: 100, msg: 'Redémarrage de La Machititine…' },
    ];
    for (const step of steps) {
      await delay(600);
      this.progress.set(step.pct);
      this.statusMessage.set(step.msg);
    }
    await delay(800);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
