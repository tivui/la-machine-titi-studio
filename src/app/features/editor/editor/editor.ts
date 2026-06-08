import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { getUrl, uploadData } from 'aws-amplify/storage';
import { ChoreographyTheme } from '../models/choreography.model';
import { LibraryService } from '../../library/services/library.service';
import { ChoreographyService } from '../services/choreography.service';
import { Choreography, ServoPoint } from '../models/choreography.model';
import { toErlang } from '../utils/erlang-generator';

// ── Constantes canvas (CSS pixels) ────────────────────────────────────────────
const RULER_H   = 28;
const AUDIO_H   = 52;
const SERVO_H   = 200;
const SERVO_PAD = 8;  // extra canvas height so pY(0) circles don't hit bottom edge
const LEFT_PAD  = 6;  // left offset so tX(0) circles don't hit left canvas boundary
export const CANVAS_H = RULER_H + AUDIO_H + SERVO_H + SERVO_PAD; // 288px (8px floor under pos=0)

const DOOR_PCT = 15;
const BTN_PCT  = 85;
const DRAG_R   = 10;

@Component({
  selector: 'app-editor',
  imports: [
    MatButtonModule, MatIconModule,
    MatInputModule, MatFormFieldModule,
    MatSelectModule, MatSliderModule,
    MatTooltipModule, MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements AfterViewInit, OnDestroy {
  @ViewChild('timeline')        private canvasRef!:         ElementRef<HTMLCanvasElement>;
  @ViewChild('mp3LocalInput')   private mp3LocalRef!:       ElementRef<HTMLInputElement>;
  @ViewChild('soundUpload')     private soundUploadRef!:    ElementRef<HTMLInputElement>;
  @ViewChild('themeImageInput') private themeImageRef!:     ElementRef<HTMLInputElement>;

  private library    = inject(LibraryService);
  private svc        = inject(ChoreographyService);
  private snackBar   = inject(MatSnackBar);

  // ── Sons disponibles (non-système) ──────────────────────────────────────────
  availableSounds = computed(() =>
    this.library.images().flatMap(img => img.sounds.filter(s => !s.isSystem))
  );

  // ── Thèmes & chorégraphies (depuis le service) ────────────────────────────
  themes = this.svc.themes;

  private _selectedThemeId = signal<string | null>(null);
  selectedThemeId = this._selectedThemeId.asReadonly();

  choreos = computed(() =>
    this.svc.choreos().filter(c => c.themeId === (this._selectedThemeId() ?? ''))
  );

  // ── Chorégraphie courante ─────────────────────────────────────────────────
  private _currentId = signal<string | null>(null);

  current = computed(() => {
    const id = this._currentId();
    return id ? (this.choreos().find(c => c.id === id) ?? null) : null;
  });

  // ── Image du thème sélectionné ───────────────────────────────────────────
  currentTheme       = computed(() => this.themes().find(t => t.id === this._selectedThemeId()) ?? null);
  uploadingThemeImage = signal(false);
  selectedThemeImageUrl = signal<string | null>(null);

  // ── Nouveau thème (formulaire inline) ────────────────────────────────────
  showNewThemeForm = signal(false);

  // ── Points sélectionnés (multi-sélection) ────────────────────────────────────
  selectedPointIds = signal<Set<string>>(new Set());
  selectedPoints   = computed(() => {
    const ids = this.selectedPointIds();
    const c   = this.current();
    if (!c || ids.size === 0) return [];
    return c.servoPoints.filter(p => ids.has(p.id));
  });
  // Raccourci : non-null seulement quand exactement 1 point sélectionné (panel détail)
  selectedPoint = computed(() => {
    const pts = this.selectedPoints();
    return pts.length === 1 ? pts[0] : null;
  });

  // ── Lecture ──────────────────────────────────────────────────────────────────
  private _playing    = signal(false);
  private _playTimeMs = signal(0);
  playing    = this._playing.asReadonly();
  playTimeMs = this._playTimeMs.asReadonly();

  // ── Audio ─────────────────────────────────────────────────────────────────────
  private audioEl:       HTMLAudioElement | null = null;
  private audioObjectUrl = '';
  private audioLoadAbort: AbortController | null = null;
  audioReady      = signal(false);
  loadingAudio    = signal(false);
  audioChannels   = signal(0);
  localMp3Name    = signal('');
  waveformData    = signal<Float32Array | null>(null);
  uploading       = signal(false);

  liveServoPos = computed(() => {
    const c = this.current();
    return c ? this.computeServoAt(c, this._playTimeMs()) : 0;
  });
  servoDisplay = computed(() => Math.round(this.liveServoPos()));

  viewDuration = computed(() => {
    const c = this.current();
    if (!c) return 10000;
    let maxT = c.mp3DurationMs;
    for (const sp of c.servoPoints) {
      maxT = Math.max(maxT, sp.timeMs + Math.max(sp.durationMs, 100) + 500);
    }
    return Math.max(maxT + 2000, 6000);
  });

  erlangPreview = computed(() => {
    const c = this.current();
    return c ? this.toErlang(c) : '';
  });

  private dragging          = false;
  private scrubbing         = false;
  private dragStartX        = 0;
  private dragStartY        = 0;
  private dragOrigins       = new Map<string, { timeMs: number; position: number }>();
  private rectSelStart:     { x: number; y: number } | null = null;
  private rectSelCurrent:   { x: number; y: number } | null = null;
  private rafId             = 0;
  private playStart         = 0;
  private saveTimerId:    ReturnType<typeof setTimeout> | null = null;
  private pendingSave:    import('../models/choreography.model').Choreography | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // Auto-sélectionner un thème quand le service charge
    effect(() => {
      const themes = this.svc.themes();
      if (themes.length > 0 && !this._selectedThemeId()) {
        const def = themes.find(t => !t.isBuiltIn) ?? themes[0];
        this._selectedThemeId.set(def.id);
      }
    });

    // Charger l'URL signée de l'image du thème sélectionné
    effect(() => {
      const theme = this.currentTheme();
      if (theme?.imageS3Key) {
        getUrl({ path: theme.imageS3Key })
          .then(({ url }) => this.selectedThemeImageUrl.set(url.toString()))
          .catch(() => this.selectedThemeImageUrl.set(null));
      } else {
        this.selectedThemeImageUrl.set(null);
      }
    });

    // Redessiner le canvas à chaque changement d'état
    effect(() => {
      void this.current();
      void this.selectedPointIds();
      void this._playTimeMs();
      void this.waveformData();
      requestAnimationFrame(() => this.drawCanvas());
    });
  }

  ngAfterViewInit(): void { this.drawCanvas(); }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    if (this.saveTimerId) clearTimeout(this.saveTimerId);
    this.resizeObserver?.disconnect();
    this.audioLoadAbort?.abort();
    if (this.audioObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(this.audioObjectUrl);
    this.audioEl?.pause();
  }

  // ── Sélection de thème ────────────────────────────────────────────────────

  onThemeChange(themeId: string): void {
    if (this._selectedThemeId() === themeId) return;
    this.stopPlay();
    this.flushPendingSave();
    this._selectedThemeId.set(themeId);
    this._currentId.set(null);
    this.selectedPointIds.set(new Set());
    this.showNewThemeForm.set(false);
    this.resetAudio();
  }

  submitNewTheme(nameEl: HTMLInputElement, emojiEl: HTMLInputElement): void {
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    const emoji = emojiEl.value.trim() || '🎵';
    this.svc.createTheme({ name, description: '', emoji })
      .then(theme => {
        this.showNewThemeForm.set(false);
        nameEl.value = '';
        this._selectedThemeId.set(theme.id);
        this._currentId.set(null);
      })
      .catch((err: unknown) =>
        this.snackBar.open(
          `Erreur création thème : ${err instanceof Error ? err.message : String(err)}`,
          undefined, { duration: 4000 },
        )
      );
  }

  // ── Image du thème ────────────────────────────────────────────────────────────

  triggerThemeImageUpload(): void {
    const theme = this.currentTheme();
    if (!theme || theme.isBuiltIn || this.uploadingThemeImage()) return;
    this.themeImageRef.nativeElement.click();
  }

  async onThemeImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    const themeId = this._selectedThemeId();
    if (!themeId) return;

    this.uploadingThemeImage.set(true);
    try {
      // Redimensionner en 512×512 JPEG côté client
      const resized = await this.resizeImage(file, 512);
      const s3Key   = `themes/${themeId}/cover.jpg`;
      await uploadData({ path: s3Key, data: resized, options: { contentType: 'image/jpeg' } }).result;

      // Charger l'URL signée immédiatement
      const { url } = await getUrl({ path: s3Key });
      this.selectedThemeImageUrl.set(url.toString());

      // Persister dans le thème
      await this.svc.updateThemeImage(themeId, s3Key);
      this.snackBar.open('Image du thème mise à jour ✓', undefined, { duration: 3000 });
    } catch (err) {
      this.snackBar.open(
        `Erreur upload : ${err instanceof Error ? err.message : String(err)}`,
        'OK', { duration: 6000 },
      );
    } finally {
      this.uploadingThemeImage.set(false);
    }
  }

  private resizeImage(file: File, maxPx: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w      = Math.round(img.width  * scale);
        const h      = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image non lisible')); };
      img.src = url;
    });
  }

  // ── CRUD chorégraphies ────────────────────────────────────────────────────────

  newChoreography(): void {
    const themeId = this._selectedThemeId();
    if (!themeId) return;
    const n    = this.choreos().length + 1;
    const name = `joy_${String(n).padStart(2, '0')}`;
    this.svc.createChoreography(themeId, name)
      .then(c => {
        this._currentId.set(c.id);
        this.selectedPointIds.set(new Set());
      })
      .catch((err: unknown) =>
        this.snackBar.open(
          `Erreur : ${err instanceof Error ? err.message : String(err)}`,
          undefined, { duration: 3000 },
        )
      );
  }

  selectChoreography(id: string): void {
    if (this._currentId() === id) return;
    this.stopPlay();
    this.flushPendingSave();
    this._currentId.set(id);
    this.selectedPointIds.set(new Set());
    this.resetAudio();
    const mp3 = this.current()?.mp3File;
    if (mp3) this.loadAudioFromLibrary(mp3);
  }

  deleteChoreography(): void {
    const id = this._currentId();
    if (!id) return;
    this.stopPlay();
    this._currentId.set(null);
    this.selectedPointIds.set(new Set());
    this.svc.deleteChoreography(id).catch(console.error);
  }

  updateName(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value) return;
    this.patchCurrent(c => ({ ...c, name: value }));
  }

  clearSelection(): void { this.selectedPointIds.set(new Set()); }

  updateVolume(value: number): void {
    this.patchCurrent(c => ({ ...c, volume: value === 100 ? undefined : value }));
  }

  updateSound(filename: string | null): void {
    const sound = filename ? this.availableSounds().find(s => s.filename === filename) : null;
    this.patchCurrent(c => ({
      ...c,
      mp3File: filename ?? '',
      mp3DurationMs: sound?.durationSec ? Math.round(sound.durationSec * 1000) : c.mp3DurationMs,
    }));
    this.resetAudio();
    if (filename) this.loadAudioFromLibrary(filename);
  }

  // ── Audio — fichier local ─────────────────────────────────────────────────────

  triggerMp3Local(): void { this.mp3LocalRef.nativeElement.click(); }

  onMp3LocalSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    this.localMp3Name.set(file.name);
    this.waveformData.set(null);
    this.audioChannels.set(0);
    this.audioReady.set(false);

    if (this.audioObjectUrl) URL.revokeObjectURL(this.audioObjectUrl);
    this.audioObjectUrl = URL.createObjectURL(file);
    this.audioEl        = new Audio(this.audioObjectUrl);

    this.audioEl.addEventListener('loadedmetadata', () => {
      if (!this.audioEl) return;
      const durationMs = Math.round(this.audioEl.duration * 1000);
      this.audioReady.set(true);
      if (durationMs > 0) this.patchCurrent(c => ({ ...c, mp3DurationMs: durationMs }));
    }, { once: true });

    file.arrayBuffer().then(async buf => {
      const ctx = new AudioContext();
      try {
        const decoded = await ctx.decodeAudioData(buf);
        this.audioChannels.set(decoded.numberOfChannels);
        this.waveformData.set(this.extractWaveform(decoded));
      } catch { /* fichier non décodable */ } finally {
        await ctx.close();
      }
    });
  }

  // ── Mono conversion ───────────────────────────────────────────────────────────

  async convertToMono(): Promise<void> {
    if (!this.audioObjectUrl) return;
    this.uploading.set(true);
    try {
      const response  = await fetch(this.audioObjectUrl);
      const arrayBuf  = await response.arrayBuffer();
      const srcCtx    = new AudioContext();
      const srcBuffer = await srcCtx.decodeAudioData(arrayBuf);
      await srcCtx.close();

      const mp3Blob = await this.encodeMono44k(srcBuffer);

      const outName = this.localMp3Name().replace(/\.(mp3|wav|ogg|aac)$/i, '') + '_mono.mp3';
      const url     = URL.createObjectURL(mp3Blob);
      Object.assign(document.createElement('a'), { href: url, download: outName }).click();
      URL.revokeObjectURL(url);

      if (this.audioObjectUrl) URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = URL.createObjectURL(mp3Blob);
      this.audioEl        = new Audio(this.audioObjectUrl);
      this.audioChannels.set(1);
      this.localMp3Name.set(outName);
      this.audioReady.set(true);

      const reCtx = new AudioContext();
      const reBuf = await reCtx.decodeAudioData(await mp3Blob.arrayBuffer());
      await reCtx.close();
      this.waveformData.set(this.extractWaveform(reBuf));
      this.patchCurrent(c => ({ ...c, mp3DurationMs: Math.round(reBuf.duration * 1000) }));

      this.snackBar.open(`"${outName}" — MP3 mono 44.1kHz prêt ✓`, undefined, { duration: 3000 });
    } catch (err) {
      this.snackBar.open('Erreur lors de la conversion MP3.', undefined, { duration: 3000 });
      console.error('[Editor] convertToMono error:', err);
    } finally {
      this.uploading.set(false);
    }
  }

  private async encodeMono44k(srcBuffer: AudioBuffer): Promise<Blob> {
    const frameCount = Math.ceil(srcBuffer.duration * 44100);
    const offline    = new OfflineAudioContext(1, frameCount, 44100);
    const node       = offline.createBufferSource();
    node.buffer      = srcBuffer;
    node.connect(offline.destination);
    node.start(0);
    const mono = await offline.startRendering();

    const f32 = mono.getChannelData(0);
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      i16[i]  = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const { Mp3Encoder } = await import('@breezystack/lamejs');
    const encoder = new Mp3Encoder(1, 44100, 128);
    const chunks: Uint8Array[] = [];
    const blockSize = 1152;

    for (let pos = 0; pos < i16.length; pos += blockSize) {
      const buf = encoder.encodeBuffer(i16.subarray(pos, pos + blockSize));
      if (buf.length > 0) chunks.push(buf);
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);

    return new Blob(chunks.map(c => c.buffer as ArrayBuffer), { type: 'audio/mpeg' });
  }

  private extractWaveform(buffer: AudioBuffer): Float32Array {
    const length = buffer.length;
    const mixed  = new Float32Array(length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mixed[i] += data[i] / buffer.numberOfChannels;
    }
    const targetLen = 1200;
    const result    = new Float32Array(targetLen);
    const ratio     = length / targetLen;
    for (let i = 0; i < targetLen; i++) {
      let max = 0;
      const s = Math.floor(i * ratio), e = Math.floor((i + 1) * ratio);
      for (let j = s; j < e; j++) max = Math.max(max, Math.abs(mixed[j]));
      result[i] = max;
    }
    return result;
  }

  // ── Upload son → S3 + Library ─────────────────────────────────────────────────

  triggerSoundUpload(): void { this.soundUploadRef.nativeElement.click(); }

  async onSoundUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    this.uploading.set(true);
    try {
      const srcCtx    = new AudioContext();
      const srcBuffer = await srcCtx.decodeAudioData(await file.arrayBuffer());
      await srcCtx.close();

      const isAlreadyMono = srcBuffer.numberOfChannels === 1;
      const durationMs    = Math.round(srcBuffer.duration * 1000);

      const mp3Blob  = await this.encodeMono44k(srcBuffer);
      const baseName = file.name.replace(/\.(mp3|wav|ogg|aac|flac)$/i, '') + '.mp3';
      const s3Path   = `sounds/personal/${baseName}`;

      if (!isAlreadyMono) {
        this.snackBar.open('Fichier stéréo converti en mono 44.1kHz — upload en cours…', undefined, { duration: 2500 });
      }

      await uploadData({ path: s3Path, data: mp3Blob, options: { contentType: 'audio/mpeg' } }).result;

      await this.library.reload();
      const libraryFilename = `personal/${baseName}`;
      this.patchCurrent(c => ({ ...c, mp3File: libraryFilename, mp3DurationMs: durationMs }));

      if (this.audioObjectUrl) URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = URL.createObjectURL(mp3Blob);
      this.audioEl        = new Audio(this.audioObjectUrl);
      this.audioChannels.set(1);
      this.localMp3Name.set(baseName);
      this.audioReady.set(true);
      this.waveformData.set(this.extractWaveform(await this.decodeBlob(mp3Blob)));

      this.snackBar.open(`"${baseName}" — MP3 mono 44.1kHz importé ✓`, undefined, { duration: 3500 });

    } catch (err) {
      this.snackBar.open(
        'Erreur upload. Le sandbox Amplify est-il démarré ? (npx amplify sandbox)',
        undefined, { duration: 5000 },
      );
      console.error('[Editor] onSoundUpload error:', err);
    } finally {
      this.uploading.set(false);
    }
  }

  private async decodeBlob(blob: Blob): Promise<AudioBuffer> {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    return buf;
  }

  // ── Point servo ──────────────────────────────────────────────────────────────

  updateSelectedPosition(value: number): void {
    const id = this.selectedPoint()?.id;
    if (id) this.patchPoint(id, p => ({ ...p, position: value }));
  }

  updateSelectedDuration(event: Event): void {
    const id = this.selectedPoint()?.id;
    if (!id) return;
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.patchPoint(id, p => ({ ...p, durationMs: isNaN(val) ? 0 : Math.max(0, val) }));
  }

  deleteSelectedPoints(): void {
    const ids = this.selectedPointIds();
    if (ids.size === 0) return;
    this.patchCurrent(c => ({ ...c, servoPoints: c.servoPoints.filter(p => !ids.has(p.id)) }));
    this.selectedPointIds.set(new Set());
  }

  duplicateSelectedPoints(): void {
    const ids = this.selectedPointIds();
    const c   = this.current();
    if (!c || ids.size === 0) return;
    const pts    = c.servoPoints.filter(p => ids.has(p.id));
    const newPts = pts.map(p => ({ ...p, id: crypto.randomUUID(), timeMs: p.timeMs + 200 }));
    const newIds = new Set(newPts.map(p => p.id));
    this.patchCurrent(ch => ({ ...ch, servoPoints: [...ch.servoPoints, ...newPts] }));
    this.selectedPointIds.set(newIds);
  }

  // ── Lecture ──────────────────────────────────────────────────────────────────

  togglePlay(): void { this._playing() ? this.stopPlay() : this.startPlay(); }

  private startPlay(): void {
    this.playStart = performance.now() - this._playTimeMs();
    this._playing.set(true);
    if (this.audioEl && this.audioReady()) {
      this.audioEl.currentTime = this._playTimeMs() / 1000;
      this.audioEl.play().catch(() => {});
    }
    this.rafId = requestAnimationFrame(this.animLoop);
  }

  stopPlay(): void {
    this._playing.set(false);
    cancelAnimationFrame(this.rafId);
    this._playTimeMs.set(0);
    this.audioEl?.pause();
    if (this.audioEl) this.audioEl.currentTime = 0;
    this.drawCanvas();
  }

  private animLoop = (): void => {
    if (!this._playing()) return;
    const elapsed = performance.now() - this.playStart;
    this._playTimeMs.set(elapsed);
    this.drawCanvas();
    if (elapsed < this.viewDuration()) {
      this.rafId = requestAnimationFrame(this.animLoop);
    } else {
      this._playing.set(false);
      this._playTimeMs.set(0);
      this.audioEl?.pause();
      if (this.audioEl) this.audioEl.currentTime = 0;
      this.drawCanvas();
    }
  };

  // ── Seek / scrub ──────────────────────────────────────────────────────────────

  private seekTo(timeMs: number): void {
    const t = Math.max(0, Math.min(timeMs, this.viewDuration()));
    this._playTimeMs.set(t);
    if (this._playing()) this.playStart = performance.now() - t;
    if (this.audioEl) {
      try { this.audioEl.currentTime = t / 1000; } catch { /* ignore */ }
    }
  }

  // ── Canvas — interactions ─────────────────────────────────────────────────────

  onCanvasMouseDown(event: MouseEvent): void {
    const c = this.current();
    if (!c) return;
    const { x, y } = this.cssCoords(event);

    if (y < RULER_H + AUDIO_H) {
      this.scrubbing = true;
      this.seekTo(this.xToTime(x));
      return;
    }

    const hit = this.hitTestPoint(c, x, y);
    if (hit) {
      if (event.shiftKey) {
        // Shift+clic : toggle dans la sélection
        const next = new Set(this.selectedPointIds());
        if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
        this.selectedPointIds.set(next);
      } else {
        // Clic simple : si le point n'est pas dans la sélection, réinitialiser
        if (!this.selectedPointIds().has(hit.id)) this.selectedPointIds.set(new Set([hit.id]));
        // Démarrer le drag sur tous les points sélectionnés
        const selIds = this.selectedPointIds();
        this.dragOrigins = new Map(
          c.servoPoints.filter(p => selIds.has(p.id)).map(p => [p.id, { timeMs: p.timeMs, position: p.position }])
        );
        this.dragging = true; this.dragStartX = x; this.dragStartY = y;
      }
    } else if (event.shiftKey) {
      // Shift+drag zone vide → rectangle de sélection
      this.rectSelStart = { x, y };
      this.rectSelCurrent = { x, y };
    } else {
      // Clic zone vide → ajouter un point
      const id = crypto.randomUUID();
      const pt: ServoPoint = { id, timeMs: this.xToTime(x), position: this.yToPos(y), durationMs: 0 };
      this.patchCurrent(ch => ({ ...ch, servoPoints: [...ch.servoPoints, pt] }));
      this.selectedPointIds.set(new Set([id]));
      this.dragOrigins = new Map([[id, { timeMs: pt.timeMs, position: pt.position }]]);
      this.dragging = true; this.dragStartX = x; this.dragStartY = y;
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const { x, y } = this.cssCoords(event);
    const canvas = this.canvasRef.nativeElement;
    canvas.style.cursor = y < RULER_H + AUDIO_H ? 'col-resize' : 'crosshair';

    if (this.scrubbing) { this.seekTo(this.xToTime(x)); return; }

    if (this.rectSelStart) {
      this.rectSelCurrent = { x, y };
      this.drawCanvas();
      return;
    }

    if (!this.dragging) return;
    const W  = canvas.clientWidth;
    const vd = this.viewDuration();
    const dtMs = (x - this.dragStartX) / W * vd;
    const dPos = -(y - this.dragStartY) / SERVO_H * 100;
    const origins = this.dragOrigins;
    this.patchCurrent(ch => ({
      ...ch,
      servoPoints: ch.servoPoints.map(p => {
        const o = origins.get(p.id);
        if (!o) return p;
        return { ...p, timeMs: Math.max(0, Math.round(o.timeMs + dtMs)), position: Math.max(0, Math.min(100, Math.round(o.position + dPos))) };
      }),
    }));
  }

  onCanvasMouseUp(event?: MouseEvent): void {
    if (this.rectSelStart && event) this.finalizeRectSel(event);
    this.dragging       = false;
    this.scrubbing      = false;
    this.rectSelStart   = null;
    this.rectSelCurrent = null;
  }

  private finalizeRectSel(event: MouseEvent): void {
    const c = this.current();
    if (!c || !this.rectSelStart) return;
    const { x: ex, y: ey } = this.cssCoords(event);
    const { x: sx, y: sy } = this.rectSelStart;
    if (Math.abs(ex - sx) < 5 && Math.abs(ey - sy) < 5) { this.selectedPointIds.set(new Set()); return; }

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const W  = canvas.clientWidth;
    const vd = this.viewDuration();
    const tX = (ms: number) => LEFT_PAD + ms / vd * (W - LEFT_PAD);
    const pY = (pos: number) => RULER_H + AUDIO_H + SERVO_H - (pos / 100 * SERVO_H);

    const x0 = Math.min(sx, ex), x1 = Math.max(sx, ex);
    const y0 = Math.min(sy, ey), y1 = Math.max(sy, ey);
    const ids = new Set(c.servoPoints.filter(p => {
      const px = tX(p.timeMs), py = pY(p.position);
      return px >= x0 && px <= x1 && py >= y0 && py <= y1;
    }).map(p => p.id));
    if (ids.size > 0) this.selectedPointIds.set(ids);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const inInput = document.activeElement instanceof HTMLInputElement ||
                    document.activeElement instanceof HTMLTextAreaElement;
    if ((event.key === 'Backspace' || event.key === 'Delete') && !inInput) {
      event.preventDefault(); this.deleteSelectedPoints();
    }
    if (event.key === ' ' && !inInput) {
      event.preventDefault(); this.togglePlay();
    }
    if (event.key === 'd' && (event.ctrlKey || event.metaKey) && !inInput) {
      event.preventDefault(); this.duplicateSelectedPoints();
    }
    if (event.key === 'Escape' && !inInput) {
      this.selectedPointIds.set(new Set());
    }
  }

  // ── Canvas — dessin ───────────────────────────────────────────────────────────

  private drawCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() =>
        requestAnimationFrame(() => this.drawCanvas())
      );
      this.resizeObserver.observe(canvas);
    }
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    if (cssW === 0) return;
    const physW = Math.round(cssW * dpr), physH = Math.round(CANVAS_H * dpr);
    if (canvas.width !== physW || canvas.height !== physH) { canvas.width = physW; canvas.height = physH; }

    const ctx = canvas.getContext('2d')!;
    ctx.save(); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, cssW, CANVAS_H);

    const c  = this.current();
    const vd = this.viewDuration();
    const tX = (ms: number) => LEFT_PAD + ms / vd * (cssW - LEFT_PAD);
    const pY = (pos: number) => RULER_H + AUDIO_H + SERVO_H - (pos / 100 * SERVO_H);

    this.drawRuler(ctx, cssW, vd, tX);
    this.drawAudioTrack(ctx, c, cssW, tX);
    this.drawServoBackground(ctx, cssW, pY);
    if (c) { this.drawServoPath(ctx, c, tX, pY); this.drawServoPoints(ctx, c, tX, pY); }
    this.drawPlayCursor(ctx, tX);
    this.drawRectSel(ctx);
    ctx.restore();
  }

  private drawRuler(ctx: CanvasRenderingContext2D, W: number, vd: number, tX: (ms: number) => number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(0, 0, W, RULER_H);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(W, RULER_H); ctx.stroke();

    const minor = vd <= 8000 ? 500 : vd <= 20000 ? 1000 : 2000;
    const major = minor * 2;
    ctx.textAlign = 'center'; ctx.font = '9px "Roboto Mono", monospace';

    for (let ms = 0; ms <= vd; ms += minor) {
      const x = tX(ms), big = ms % major === 0;
      ctx.strokeStyle = big ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, RULER_H - (big ? 9 : 4)); ctx.lineTo(x, RULER_H); ctx.stroke();
      if (big) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        if (ms === 0) {
          ctx.textAlign = 'left';
          ctx.fillText('0ms', 4, RULER_H - 12);
          ctx.textAlign = 'center';
        } else {
          ctx.fillText(ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`, x, RULER_H - 12);
        }
      }
    }
  }

  private drawAudioTrack(ctx: CanvasRenderingContext2D, c: Choreography | null, W: number, tX: (ms: number) => number): void {
    const y0 = RULER_H;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y0 + AUDIO_H); ctx.lineTo(W, y0 + AUDIO_H); ctx.stroke();

    const displayName = c?.mp3File || this.localMp3Name();
    const durationMs  = c?.mp3DurationMs ?? 0;
    const waveform    = this.waveformData();

    if (!displayName && !waveform) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.font = '11px "Inter", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Aucun son — chargez un fichier MP3 ou choisissez dans la bibliothèque', W / 2, y0 + AUDIO_H / 2 + 4);
      return;
    }

    const barW = durationMs > 0 ? Math.min(tX(durationMs), W) : W * 0.75;
    const barY = y0 + 6, barH = AUDIO_H - 12;
    const midY = y0 + AUDIO_H / 2;

    const grad = ctx.createLinearGradient(0, 0, barW, 0);
    grad.addColorStop(0,   'rgba(185,115,0,0.18)');
    grad.addColorStop(0.6, 'rgba(185,115,0,0.09)');
    grad.addColorStop(1,   'rgba(185,115,0,0.02)');
    ctx.fillStyle = grad; ctx.fillRect(0, barY, barW, barH);
    ctx.strokeStyle = 'rgba(185,115,0,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(0, barY, barW, barH);

    if (waveform && waveform.length > 0) {
      const maxAmp = (barH / 2) * 0.88;
      ctx.strokeStyle = 'rgba(160,95,0,0.65)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let i = 0; i < waveform.length; i++) {
        const x   = (i / waveform.length) * barW;
        const amp = waveform[i] * maxAmp;
        ctx.moveTo(x, midY - amp);
        ctx.lineTo(x, midY + amp);
      }
      ctx.stroke();
    }

    const isStereo = this.audioChannels() > 1;
    ctx.fillStyle  = isStereo ? 'rgba(180,40,0,0.85)' : 'rgba(130,80,0,0.85)';
    ctx.font       = '11px "Inter", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`♪  ${displayName}${isStereo ? '  ⚠ stéréo' : ''}`, 10, y0 + 16);

    if (durationMs) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.font = '10px "Roboto Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(`${(durationMs / 1000).toFixed(2)}s`, Math.min(barW, W) - 8, y0 + 16);
    }
  }

  private drawServoBackground(ctx: CanvasRenderingContext2D, W: number, pY: (pos: number) => number): void {
    const y0 = RULER_H + AUDIO_H;
    ctx.fillStyle = 'rgba(0,0,0,0.025)'; ctx.fillRect(0, y0, W, SERVO_H);

    [25, 50, 75].forEach(p => {
      ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, pY(p)); ctx.lineTo(W, pY(p)); ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(185,115,0,0.35)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(0, pY(DOOR_PCT)); ctx.lineTo(W, pY(DOOR_PCT)); ctx.stroke();

    ctx.strokeStyle = 'rgba(180,40,0,0.35)';
    ctx.beginPath(); ctx.moveTo(0, pY(BTN_PCT)); ctx.lineTo(W, pY(BTN_PCT)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'left'; ctx.font = '9px "Roboto Mono", monospace';
    [0, 25, 50, 75, 100].forEach(p => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillText(`${p}`, 4, pY(p) - 3); });
    ctx.fillStyle = 'rgba(160,95,0,0.65)'; ctx.fillText('trappe', W - 52, pY(DOOR_PCT) - 3);
    ctx.fillStyle = 'rgba(160,40,0,0.70)'; ctx.fillText('contact', W - 58, pY(BTN_PCT) - 3);
  }

  private drawServoPath(ctx: CanvasRenderingContext2D, c: Choreography, tX: (ms: number) => number, pY: (pos: number) => number): void {
    const sorted = [...c.servoPoints].sort((a, b) => a.timeMs - b.timeMs);
    ctx.strokeStyle = 'rgba(170,100,0,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath();

    let prevPos = 0;
    sorted.forEach((sp, i) => {
      const sx = tX(sp.timeMs), ex = tX(sp.timeMs + sp.durationMs);
      if (i === 0) { ctx.moveTo(tX(0), pY(0)); ctx.lineTo(sx, pY(prevPos)); }
      else ctx.lineTo(sx, pY(prevPos));
      ctx.lineTo(ex, pY(sp.position)); prevPos = sp.position;
    });
    ctx.lineTo(tX(this.viewDuration()), pY(prevPos)); ctx.stroke();
  }

  private drawServoPoints(ctx: CanvasRenderingContext2D, c: Choreography, tX: (ms: number) => number, pY: (pos: number) => number): void {
    const selIds   = this.selectedPointIds();
    const onlySel  = selIds.size === 1;
    for (const sp of c.servoPoints) {
      const x = tX(sp.timeMs), y = pY(sp.position), sel = selIds.has(sp.id);
      if (sp.durationMs > 0) {
        const ex = tX(sp.timeMs + sp.durationMs);
        ctx.strokeStyle = sel ? 'rgba(185,115,0,0.70)' : 'rgba(185,115,0,0.30)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, y); ctx.stroke();
        ctx.fillStyle = sel ? '#C88000' : 'rgba(185,115,0,0.45)';
        ctx.beginPath(); ctx.arc(ex, y, 4, 0, Math.PI * 2); ctx.fill();
      }
      const r = sel ? 8 : 6;
      if (sel) { ctx.shadowColor = 'rgba(185,115,0,0.5)'; ctx.shadowBlur = 10; }
      ctx.fillStyle   = sel ? '#C88000' : 'rgba(185,115,0,0.85)';
      ctx.strokeStyle = sel ? '#7A5200' : 'rgba(185,115,0,0.45)';
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      if (sel) {
        ctx.strokeStyle = 'rgba(185,115,0,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
        // Labels uniquement pour sélection simple
        if (onlySel) {
          ctx.fillStyle = '#120F0A'; ctx.font = 'bold 11px "Roboto Mono", monospace'; ctx.textAlign = 'center';
          ctx.fillText(`${sp.position}%`, x, y - 17);
          ctx.fillStyle = 'rgba(130,80,0,0.75)'; ctx.font = '9px "Roboto Mono", monospace';
          ctx.fillText(`${sp.timeMs}ms`, x, y + 20);
        }
      }
    }
  }

  private drawRectSel(ctx: CanvasRenderingContext2D): void {
    if (!this.rectSelStart || !this.rectSelCurrent) return;
    const { x: x0, y: y0 } = this.rectSelStart;
    const { x: x1, y: y1 } = this.rectSelCurrent;
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.fillStyle   = 'rgba(250,185,0,0.07)';
    ctx.strokeStyle = 'rgba(250,185,0,0.55)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }

  private drawPlayCursor(ctx: CanvasRenderingContext2D, tX: (ms: number) => number): void {
    const t         = this._playTimeMs();
    const isPlaying = this._playing();
    if (!isPlaying && t === 0) return;

    const x = tX(t);

    if (isPlaying) {
      ctx.strokeStyle = '#C42000'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.globalAlpha = 0.9;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.40)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.globalAlpha = 0.8;
    }

    ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    const hw = isPlaying ? 6 : 5;
    ctx.fillStyle = isPlaying ? '#C42000' : 'rgba(0,0,0,0.50)';
    ctx.beginPath(); ctx.moveTo(x - hw, RULER_H - 1); ctx.lineTo(x + hw, RULER_H - 1);
    ctx.lineTo(x, RULER_H + 8); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = isPlaying ? 'rgba(196,32,0,0.5)' : 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RULER_H - 1); ctx.stroke();

    const label = t >= 1000 ? `${(t / 1000).toFixed(2)}s` : `${t}ms`;
    ctx.font      = '9px "Roboto Mono", monospace';
    ctx.fillStyle = isPlaying ? 'rgba(196,32,0,0.90)' : 'rgba(0,0,0,0.40)';
    ctx.textAlign = x > 40 ? 'right' : 'left';
    ctx.fillText(label, x > 40 ? x - 8 : x + 8, RULER_H - 3);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private resetAudio(): void {
    this.audioLoadAbort?.abort();
    this.audioLoadAbort = null;
    this.loadingAudio.set(false);
    this.audioReady.set(false);
    this.audioChannels.set(0);
    this.localMp3Name.set('');
    this.waveformData.set(null);
    if (this.audioObjectUrl?.startsWith('blob:')) { URL.revokeObjectURL(this.audioObjectUrl); }
    this.audioObjectUrl = '';
    this.audioEl?.pause();
    this.audioEl = null;
  }

  private async loadAudioFromLibrary(filename: string): Promise<void> {
    this.audioLoadAbort = new AbortController();
    const abort = this.audioLoadAbort;
    this.loadingAudio.set(true);
    try {
      const { url } = await getUrl({ path: `sounds/${filename}` });
      if (abort.signal.aborted) return;
      const audioUrl = url.toString();

      this.audioObjectUrl = audioUrl;
      this.audioEl = new Audio(audioUrl);
      this.localMp3Name.set(filename);

      // Attend que l'audio element charge les métadonnées (ou échoue)
      // Les URL signées S3 sont signées pour GET uniquement — pas de HEAD probe
      await new Promise<void>((resolve, reject) => {
        this.audioEl!.addEventListener('loadedmetadata', () => {
          if (abort.signal.aborted) { resolve(); return; }
          const durationMs = Math.round(this.audioEl!.duration * 1000);
          this.audioReady.set(true);
          if (durationMs > 0) this.patchCurrent(c => ({ ...c, mp3DurationMs: durationMs }));
          resolve();
        }, { once: true });
        this.audioEl!.addEventListener('error', () => {
          reject(new Error('audio-load-error'));
        }, { once: true });
        abort.signal.addEventListener('abort', () => resolve(), { once: true });
      });

      if (abort.signal.aborted || !this.audioReady()) return;

      // Décode le fichier pour la forme d'onde — peut échouer silencieusement si le bucket
      // S3 n'a pas encore de règle CORS pour localhost (l'audio joue quand même).
      try {
        const response = await fetch(audioUrl, { signal: abort.signal });
        if (abort.signal.aborted || !response.ok) return;
        const arrayBuf = await response.arrayBuffer();
        if (abort.signal.aborted) return;
        const decoded = await this.decodeBlob(new Blob([arrayBuf]));
        if (abort.signal.aborted) return;
        this.audioChannels.set(decoded.numberOfChannels);
        this.waveformData.set(this.extractWaveform(decoded));
      } catch {
        // CORS ou réseau — la forme d'onde n'est pas affichée, l'audio est toujours lisible
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      const isAudioErr = err instanceof Error && err.message === 'audio-load-error';
      console.warn('[Editor] loadAudioFromLibrary:', err);
      this.audioEl = null;
      this.audioObjectUrl = '';
      this.snackBar.open(
        isAudioErr
          ? `Son absent de S3 — uploadez-le via Bibliothèque ou chargez-le localement`
          : `Connexion S3 indisponible — chargez le fichier localement`,
        undefined, { duration: 5000 },
      );
    } finally {
      if (!abort.signal.aborted) this.loadingAudio.set(false);
    }
  }

  private cssCoords(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private xToTime(x: number): number {
    return Math.round(Math.max(0, x / this.canvasRef.nativeElement.clientWidth * this.viewDuration()));
  }

  private yToPos(y: number): number {
    return Math.round(Math.max(0, Math.min(100, (1 - (y - RULER_H - AUDIO_H) / SERVO_H) * 100)));
  }

  private hitTestPoint(c: Choreography, x: number, y: number): ServoPoint | null {
    const W = this.canvasRef.nativeElement.clientWidth, vd = this.viewDuration();
    const tX = (ms: number) => ms / vd * W;
    const pY = (pos: number) => RULER_H + AUDIO_H + SERVO_H - (pos / 100 * SERVO_H);
    for (const sp of c.servoPoints) {
      if (Math.hypot(x - tX(sp.timeMs), y - pY(sp.position)) < DRAG_R) return sp;
    }
    return null;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  copyErlang(): void {
    const c = this.current();
    if (!c) return;
    navigator.clipboard.writeText(this.toErlang(c)).then(() =>
      this.snackBar.open('Copié dans le presse-papier', undefined, { duration: 2000 })
    );
  }

  exportJson(): void {
    const c = this.current();
    if (!c) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ [c.name]: this.toErlang(c) }, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `${c.name}.json` }).click();
    URL.revokeObjectURL(url);
  }

  private toErlang(c: Choreography): string {
    return toErlang(c);
  }

  // ── Mutateurs signal ──────────────────────────────────────────────────────────

  private patchCurrent(fn: (c: Choreography) => Choreography): void {
    const id = this._currentId();
    const c  = this.current();
    if (!id || !c) return;
    const updated = fn(c);
    this.svc.updateLocal(updated);
    this.pendingSave = updated;
    if (this.saveTimerId) clearTimeout(this.saveTimerId);
    this.saveTimerId = setTimeout(() => {
      this.svc.saveRemote(updated).catch(console.error);
      this.pendingSave = null;
      this.saveTimerId = null;
    }, 800);
  }

  private flushPendingSave(): void {
    if (this.saveTimerId) {
      clearTimeout(this.saveTimerId);
      this.saveTimerId = null;
    }
    if (this.pendingSave) {
      this.svc.saveRemote(this.pendingSave).catch(console.error);
      this.pendingSave = null;
    }
  }

  private patchPoint(pid: string, fn: (p: ServoPoint) => ServoPoint): void {
    this.patchCurrent(c => ({ ...c, servoPoints: c.servoPoints.map(p => p.id === pid ? fn(p) : p) }));
  }

  private computeServoAt(c: Choreography, t: number): number {
    const sorted = [...c.servoPoints].sort((a, b) => a.timeMs - b.timeMs);
    let pos = 0;
    for (const sp of sorted) {
      if (sp.timeMs > t) break;
      const elapsed = t - sp.timeMs, dur = sp.durationMs || 0;
      if (dur === 0 || elapsed >= dur) pos = sp.position;
      else { pos = pos + (sp.position - pos) * (elapsed / dur); break; }
    }
    return pos;
  }
}
