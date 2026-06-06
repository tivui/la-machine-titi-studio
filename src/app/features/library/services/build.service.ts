import { Injectable, computed, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import { Choreography, ChoreographyTheme } from '../../editor/models/choreography.model';
import { toChoreoJson } from '../../editor/utils/erlang-generator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = generateClient<any>();

export type BuildStatus = 'queued' | 'running' | 'success' | 'failed';

export interface BuildJob {
  id: string;
  themeId: string;
  themeName: string;
  status: BuildStatus;
  workflowRunId?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  imageS3Key?: string;
}

@Injectable({ providedIn: 'root' })
export class BuildService {
  private readonly _jobs    = signal<BuildJob[]>([]);
  private readonly _loading = signal(false);
  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  readonly jobs    = this._jobs.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly activeJobs = computed(() =>
    this._jobs().filter(j => j.status === 'queued' || j.status === 'running')
  );

  latestJobForTheme(themeId: string): BuildJob | undefined {
    return this._jobs()
      .filter(j => j.themeId === themeId)
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))[0];
  }

  async loadJobs(): Promise<void> {
    this._loading.set(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items, errors } = await (client as any).models.BuildJob.list({
        selectionSet: ['id', 'themeId', 'themeName', 'status', 'workflowRunId',
                       'startedAt', 'completedAt', 'errorMessage', 'imageS3Key'],
      });
      if (errors?.length) throw new Error(errors[0].message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: BuildJob[] = (items ?? []).map((j: any) => ({
        id:             j.id,
        themeId:        j.themeId,
        themeName:      j.themeName,
        status:         j.status as BuildStatus,
        workflowRunId:  j.workflowRunId ?? undefined,
        startedAt:      j.startedAt ? new Date(j.startedAt) : undefined,
        completedAt:    j.completedAt ? new Date(j.completedAt) : undefined,
        errorMessage:   j.errorMessage ?? undefined,
        imageS3Key:     j.imageS3Key ?? undefined,
      }));
      mapped.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
      this._jobs.set(mapped);
    } catch (err) {
      console.warn('[BuildService] Impossible de charger les BuildJobs:', err);
    } finally {
      this._loading.set(false);
    }
  }

  async triggerBuild(theme: ChoreographyTheme, choreos: Choreography[]): Promise<{ buildJobId: string; workflowUrl: string }> {
    const choreoJson    = toChoreoJson(choreos);
    const jsonStr       = JSON.stringify(choreoJson);
    const b64           = btoa(unescape(encodeURIComponent(jsonStr)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, errors } = await (client as any).mutations.triggerBuild({
      themeId:           theme.id,
      themeName:         theme.name,
      choreographiesB64: b64,
    });

    if (errors?.length) throw new Error(errors[0].message);

    // Optimistic update — job sera rafraîchi au prochain polling
    this._jobs.update(jobs => [{
      id:        result.buildJobId ?? crypto.randomUUID(),
      themeId:   theme.id,
      themeName: theme.name,
      status:    'queued',
      startedAt: new Date(),
    }, ...jobs]);

    this.startPolling();
    return { buildJobId: result.buildJobId, workflowUrl: result.workflowUrl };
  }

  startPolling(): void {
    if (this._pollInterval) return;
    // Recharger toutes les 30s tant qu'il y a des jobs actifs
    this._pollInterval = setInterval(async () => {
      await this.loadJobs();
      if (this.activeJobs().length === 0) {
        this.stopPolling();
      }
    }, 30_000);
  }

  stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }
}
