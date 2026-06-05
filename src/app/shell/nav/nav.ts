import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav {
  @Input() signOut?: () => void;

  logout() {
    this.signOut?.();
  }
}
