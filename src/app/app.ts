import { Component, Input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AmplifyAuthenticatorModule } from '@aws-amplify/ui-angular';
import { Nav } from './shell/nav/nav';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Nav, AmplifyAuthenticatorModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
