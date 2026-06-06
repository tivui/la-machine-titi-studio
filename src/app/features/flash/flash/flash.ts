import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getUrl } from 'aws-amplify/storage';
import { ESPLoader, Transport } from 'esptool-js';
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
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private libraryService = inject(LibraryService);

  private imageId = toSignal(this.route.queryParams.pipe(map(p => p['imageId'] as string | undefined)));

  selectedImage = computed(() => {
    const id = this.imageId();
    return id ? this.libraryService.images().find(i => i.id === id) ?? null : null;
  });

  readonly isWebSerialSupported = 'serial' in navigator;

  state         = signal<FlashState>('ready');
  progress      = signal(0);
  statusMessage = signal('');
  errorMessage  = signal('');

  async connectAndFlash(): Promise<void> {
    if (!this.isWebSerialSupported) return;
    const image = this.selectedImage();
    if (!image) return;

    this.state.set('connecting');
    this.progress.set(0);
    this.errorMessage.set('');
    this.statusMessage.set('Sélection du port série…');

    let transport: Transport | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort() as any;

      this.statusMessage.set('Téléchargement du firmware depuis S3…');
      this.progress.set(5);

      // 1. Récupérer l'URL signée S3 et télécharger le firmware
      const { url } = await getUrl({ path: image.s3Key });
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Téléchargement échoué : HTTP ${response.status}`);
      const buffer = new Uint8Array(await response.arrayBuffer());
      this.progress.set(15);

      this.state.set('flashing');
      this.statusMessage.set('Connexion à La Machine (RST + IO0)…');

      // 2. ESPLoader init
      transport = new Transport(port, true);
      const loader = new ESPLoader({
        transport,
        baudrate: 921600,
        terminal: {
          clean:     ()  => {},
          writeLine: (s) => console.log('[esptool]', s),
          write:     ()  => {},
        },
        debugLogging: false,
      });

      await loader.main();
      this.progress.set(20);
      this.statusMessage.set('Puce détectée — écriture du firmware…');

      // 3. Flash offset 0 (image complète : bootloader + partitions + AtomVM + la_machine + sons)
      await loader.writeFlash({
        fileArray:  [{ data: buffer, address: 0x0 }],
        flashSize:  'keep',
        flashMode:  'keep',
        flashFreq:  'keep',
        eraseAll:   false,
        compress:   true,
        reportProgress: (_fileIdx, written, total) => {
          const pct = 20 + Math.round((written / total) * 75);
          this.progress.set(pct);
          this.statusMessage.set(`Écriture… ${Math.round(written / total * 100)}%`);
        },
      });

      // 4. Hard reset pour démarrer le firmware
      this.progress.set(97);
      this.statusMessage.set('Redémarrage de La Machine…');
      await loader.after('hard_reset');

      this.progress.set(100);
      this.state.set('success');
      this.statusMessage.set('Firmware flashé avec succès !');
    } catch (err: unknown) {
      const domErr = err as DOMException;
      if (domErr?.name === 'NotFoundError') {
        this.state.set('ready');
      } else {
        this.errorMessage.set(domErr?.message ?? String(err));
        this.state.set('error');
      }
    } finally {
      // Toujours fermer le transport, même en cas d'erreur
      if (transport) {
        await transport.disconnect().catch(() => {});
      }
    }
  }

  formatSize(kb?: number): string {
    if (!kb) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  reset(): void {
    this.state.set('ready');
    this.progress.set(0);
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  goToLibrary(): void {
    this.router.navigate(['/library']);
  }
}
