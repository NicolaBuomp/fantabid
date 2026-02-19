import { Injectable } from '@angular/core';

export type AppTheme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'auto';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly storageKey = 'fantabid-theme-mode';
  private currentTheme: AppTheme = 'light';
  private currentMode: ThemeMode = 'auto';
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  initializeTheme(): AppTheme {
    const storedMode = localStorage.getItem(this.storageKey) as ThemeMode | null;

    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'auto') {
      this.currentMode = storedMode;
    } else {
      this.currentMode = 'auto';
    }

    this.currentTheme = this.resolveTheme(this.currentMode);
    this.applyTheme(this.currentTheme);

    this.mediaQuery.addEventListener('change', () => {
      if (this.currentMode === 'auto') {
        this.currentTheme = this.getSystemTheme();
        this.applyTheme(this.currentTheme);
      }
    });

    return this.currentTheme;
  }

  toggleMode(): ThemeMode {
    const order: ThemeMode[] = ['light', 'dark', 'auto'];
    const currentIndex = order.indexOf(this.currentMode);
    const nextMode = order[(currentIndex + 1) % order.length];
    this.setMode(nextMode);
    return nextMode;
  }

  setMode(mode: ThemeMode): void {
    this.currentMode = mode;
    this.currentTheme = this.resolveTheme(mode);
    this.applyTheme(this.currentTheme);
    localStorage.setItem(this.storageKey, mode);
  }

  isDark(): boolean {
    return this.currentTheme === 'dark';
  }

  getMode(): ThemeMode {
    return this.currentMode;
  }

  getResolvedTheme(): AppTheme {
    return this.currentTheme;
  }

  private resolveTheme(mode: ThemeMode): AppTheme {
    if (mode === 'auto') {
      return this.getSystemTheme();
    }

    return mode;
  }

  private getSystemTheme(): AppTheme {
    return this.mediaQuery.matches ? 'dark' : 'light';
  }

  private applyTheme(theme: AppTheme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
