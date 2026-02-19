import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  ImportConfirmResponse,
  ImportPreviewResponse,
  League,
  LeagueApiService,
  LeagueMember,
  LeagueMembership,
} from '../../../core/league-api.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="mx-auto max-w-6xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Import Listone</h1>
          <p class="text-sm opacity-80">{{ league()?.name || 'Import da file .xlsx' }}</p>
        </div>
        <button (click)="goToSetup()" class="rounded border px-4 py-2">Torna a Setup</button>
      </header>

      @if (message()) {
        <p class="mb-4 text-sm">{{ message() }}</p>
      }

      @if (loadingLeague()) {
        <p class="text-sm opacity-80">Caricamento lega...</p>
      } @else if (!isAdmin()) {
        <section class="theme-surface rounded border p-4">
          <p class="font-medium">Accesso negato</p>
          <p class="mt-1 text-sm opacity-80">Solo l'admin può eseguire import listone.</p>
        </section>
      } @else {
        <section class="theme-surface mb-6 rounded border p-4">
          <h2 class="mb-2 text-lg font-semibold">Upload</h2>
          <p class="mb-4 text-sm opacity-80">Seleziona un file Excel .xlsx.</p>

          <div
            class="rounded border-2 border-dashed p-6 text-center"
            [class.border-blue-500]="isDraggingFile()"
            [class.border-slate-300]="!isDraggingFile()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
          >
            <p class="text-sm">Trascina qui il file .xlsx</p>
            <p class="my-2 text-xs opacity-70">oppure</p>
            <button
              type="button"
              class="rounded border px-3 py-2 text-sm"
              (click)="openFilePicker(fileInput)"
            >
              Scegli file
            </button>
          </div>

          <input
            #fileInput
            type="file"
            accept=".xlsx"
            class="hidden"
            (change)="onFileSelected($event)"
          />

          @if (selectedFile()) {
            <p class="mt-3 text-sm">File selezionato: {{ selectedFile()!.name }}</p>
          }

          <div class="mt-3 flex gap-2">
            <button
              (click)="runPreview()"
              [disabled]="previewLoading() || !selectedFile()"
              class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {{ previewLoading() ? 'Parsing...' : 'Genera Preview' }}
            </button>
          </div>
        </section>

        @if (preview()) {
          <section class="theme-surface mb-6 rounded border p-4">
            <h2 class="mb-3 text-lg font-semibold">Preview</h2>

            <div class="grid gap-3 md:grid-cols-3">
              <p>
                Totale righe: <strong>{{ preview()!.preview.total_rows }}</strong>
              </p>
              <p>
                Esclusi fuori lista: <strong>{{ preview()!.preview.excluded_fuori_lista }}</strong>
              </p>
              <p>
                Importabili: <strong>{{ preview()!.preview.importable }}</strong>
              </p>
              <p>
                Disponibili: <strong>{{ preview()!.preview.available }}</strong>
              </p>
              <p>
                Venduti: <strong>{{ preview()!.preview.sold }}</strong>
              </p>
              <p>
                Fantasquadre: <strong>{{ preview()!.preview.fanta_teams.length }}</strong>
              </p>
            </div>

            @if (preview()!.preview.warnings.length) {
              <div class="mt-4 rounded border border-yellow-500 p-3 text-sm">
                <p class="mb-1 font-medium">Warnings</p>
                @for (warning of preview()!.preview.warnings; track warning) {
                  <p>- {{ warning }}</p>
                }
              </div>
            }

            @if (preview()!.preview.errors.length) {
              <div class="mt-4 rounded border border-red-500 p-3 text-sm">
                <p class="mb-1 font-medium">Errori parsing (prime 20 righe)</p>
                @for (
                  errorItem of preview()!.preview.errors.slice(0, 20);
                  track errorItem.row + errorItem.message
                ) {
                  <p>- Riga {{ errorItem.row }}: {{ errorItem.message }}</p>
                }
              </div>
            }
          </section>

          <section class="theme-surface mb-6 rounded border p-4">
            <h2 class="mb-3 text-lg font-semibold">Mapping Fantasquadre → Membri</h2>

            @if (!preview()!.preview.fanta_teams.length) {
              <p class="text-sm opacity-80">Nessuna fantasquadra trovata nel file.</p>
              <p class="mt-1 text-sm opacity-80">
                Puoi comunque confermare: i giocatori verranno importati come disponibili.
              </p>
            } @else {
              <div class="space-y-2">
                @for (team of preview()!.preview.fanta_teams; track team.name) {
                  <article class="rounded border p-3">
                    <div class="grid items-center gap-3 md:grid-cols-4">
                      <div class="md:col-span-2">
                        <p class="font-medium">{{ team.name }}</p>
                        <p class="text-sm opacity-80">
                          Giocatori: {{ team.players_count }} · Spesa: {{ team.total_cost }}
                        </p>
                      </div>

                      <select
                        class="theme-surface rounded border px-3 py-2 md:col-span-2"
                        [value]="teamMapping()[team.name] ?? ''"
                        (change)="setTeamMapping(team.name, $any($event.target).value)"
                      >
                        <option value="">Nessuno</option>
                        @for (member of approvedMembers(); track member.id) {
                          <option [value]="member.id">
                            {{ member.profiles?.username || member.user_id || member.id }}
                          </option>
                        }
                      </select>
                    </div>
                  </article>
                }
              </div>
            }

            <button
              (click)="confirmImport()"
              [disabled]="confirmLoading()"
              class="mt-4 rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {{ confirmLoading() ? 'Conferma in corso...' : 'Conferma Import' }}
            </button>
          </section>
        }

        @if (result()) {
          <section class="theme-surface rounded border p-4">
            <h2 class="mb-3 text-lg font-semibold">Risultato Import</h2>
            <div class="grid gap-2 md:grid-cols-2">
              <p>
                Totale giocatori: <strong>{{ result()!.imported.total_players }}</strong>
              </p>
              <p>
                Disponibili: <strong>{{ result()!.imported.available }}</strong>
              </p>
              <p>
                Venduti: <strong>{{ result()!.imported.sold }}</strong>
              </p>
              <p>
                Membri aggiornati: <strong>{{ result()!.imported.members_updated }}</strong>
              </p>
              <p>
                Unmapped players → available:
                <strong>{{ result()!.imported.unmapped_players_set_available }}</strong>
              </p>
              <p>
                Unmapped teams:
                <strong>{{ result()!.imported.unmapped_teams.join(', ') || 'Nessuna' }}</strong>
              </p>
            </div>
          </section>
        }
      }
    </main>
  `,
})
export class LeagueImportPageComponent {
  private readonly leagueApi = inject(LeagueApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly leagueId = signal('');
  readonly league = signal<League | null>(null);
  readonly viewerMembership = signal<LeagueMembership | null>(null);
  readonly members = signal<LeagueMember[]>([]);
  readonly loadingLeague = signal(true);
  readonly previewLoading = signal(false);
  readonly confirmLoading = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly isDraggingFile = signal(false);
  readonly preview = signal<ImportPreviewResponse | null>(null);
  readonly result = signal<ImportConfirmResponse | null>(null);
  readonly teamMapping = signal<Record<string, string | null>>({});
  readonly message = signal('');

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const leagueId = params.get('id') ?? '';
          this.leagueId.set(leagueId);
          this.loadingLeague.set(true);
          return this.leagueApi.getLeagueDetail(leagueId);
        }),
      )
      .subscribe({
        next: ({ league, viewerMembership, members }) => {
          this.league.set(league);
          this.viewerMembership.set(viewerMembership);
          this.members.set(members);
          this.loadingLeague.set(false);
        },
        error: (error: unknown) => {
          this.loadingLeague.set(false);
          this.message.set(this.parseHttpError(error, 'Caricamento pagina import fallito'));
        },
      });
  }

  isAdmin(): boolean {
    return this.viewerMembership()?.role === 'ADMIN';
  }

  approvedMembers(): LeagueMember[] {
    return this.members().filter((member) => member.status === 'APPROVED');
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.setSelectedFile(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.setSelectedFile(file);
  }

  openFilePicker(input: HTMLInputElement) {
    input.click();
  }

  runPreview() {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.previewLoading.set(true);
    this.result.set(null);
    this.message.set('');

    this.leagueApi.importPlayersPreview(this.leagueId(), file).subscribe({
      next: (response) => {
        this.previewLoading.set(false);
        this.preview.set(response);
        const mapping = response.preview.fanta_teams.reduce<Record<string, string | null>>(
          (acc, team) => {
            acc[team.name] = null;
            return acc;
          },
          {},
        );
        this.teamMapping.set(mapping);
      },
      error: (error: unknown) => {
        this.previewLoading.set(false);
        this.message.set(this.parseHttpError(error, 'Preview import fallita'));
      },
    });
  }

  setTeamMapping(teamName: string, memberId: string) {
    const current = this.teamMapping();
    this.teamMapping.set({
      ...current,
      [teamName]: memberId || null,
    });
  }

  confirmImport() {
    this.confirmLoading.set(true);
    this.message.set('');

    this.leagueApi
      .importPlayersConfirm(this.leagueId(), {
        team_mapping: this.teamMapping(),
        overwrite_existing: true,
      })
      .subscribe({
        next: (response) => {
          this.confirmLoading.set(false);
          this.result.set(response);
          this.message.set('Import completato con successo.');
        },
        error: (error: unknown) => {
          this.confirmLoading.set(false);
          this.message.set(this.parseHttpError(error, 'Conferma import fallita'));
        },
      });
  }

  goToSetup() {
    this.router.navigateByUrl(`/league/${this.leagueId()}/setup`);
  }

  private setSelectedFile(file: File | null) {
    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.selectedFile.set(null);
      this.message.set('Formato file non valido. Carica un file .xlsx');
      return;
    }

    this.message.set('');
    this.selectedFile.set(file);
  }

  private parseHttpError(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null
    ) {
      const payload = error.error as Record<string, unknown>;
      const message = typeof payload['message'] === 'string' ? payload['message'] : null;
      const code = typeof payload['error'] === 'string' ? payload['error'] : null;

      if (message && code) {
        return `${code}: ${message}`;
      }

      if (message) {
        return message;
      }

      if (code) {
        return code;
      }
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'error' in error.error &&
      typeof error.error.error === 'string'
    ) {
      return error.error.error;
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }
}
