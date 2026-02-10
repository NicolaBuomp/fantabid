import { bootstrapApplication } from '@angular/platform-browser';
import 'zone.js'; // <--- AGGIUNGI QUESTO
import { AppComponent } from './app/app.components';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
