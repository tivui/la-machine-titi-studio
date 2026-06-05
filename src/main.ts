import { bootstrapApplication } from '@angular/platform-browser';
import { Amplify } from 'aws-amplify';
import { I18n } from 'aws-amplify/utils';
import { translations } from '@aws-amplify/ui-angular';
import outputs from '../amplify_outputs.json';
import { appConfig } from './app/app.config';
import { App } from './app/app';

Amplify.configure(outputs);

// Traductions intégrées (fr, en, de, es, zh, ja…) + langue FR par défaut
I18n.putVocabularies(translations);
I18n.setLanguage('fr');

// Surcharge pour le contexte La Machine + corrections non couvertes par le pack fr
I18n.putVocabulariesForLanguage('fr', {
  'Sign In':                   'Se connecter',
  'Sign in':                   'Se connecter',
  'Sign in to your account':   'Connexion',
  'Create Account':            'Créer un compte',
  'Forgot your password?':     'Mot de passe oublié ?',
  'Back to Sign In':           'Retour à la connexion',
  // Étape "verify contact" — libellé plus court
  'Account recovery requires verified contact information':
    'Vérifiez votre adresse email',
  'Verify':  'Vérifier',
  'Skip':    'Passer',
  // Erreurs Cognito
  'Incorrect username or password.':
    'Email ou mot de passe incorrect.',
  'User does not exist.':
    'Aucun compte trouvé avec cet email.',
  'Password did not conform with policy: Password not long enough':
    'Mot de passe trop court (8 caractères minimum).',
  'An account with the given email already exists.':
    'Un compte avec cet email existe déjà.',
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
