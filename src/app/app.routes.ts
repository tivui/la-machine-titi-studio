import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'library', pathMatch: 'full' },
  {
    path: 'library',
    loadComponent: () => import('./features/library/library/library').then(m => m.Library),
  },
  {
    path: 'flash',
    loadComponent: () => import('./features/flash/flash/flash').then(m => m.Flash),
  },
  {
    path: 'editor',
    loadComponent: () => import('./features/editor/editor/editor').then(m => m.Editor),
  },
];
