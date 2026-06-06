import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { triggerBuild } from './functions/trigger-build/resource';

// triggerBuild est aussi référencé dans data/resource.ts via a.handler.function()
// — on l'inclut ici pour que CDK crée la ressource Lambda correctement.
const backend = defineBackend({ auth, data, storage, triggerBuild });

export { backend };
