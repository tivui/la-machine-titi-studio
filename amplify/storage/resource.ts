import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'machineStorage',
  access: (allow) => ({
    'images/*': [allow.authenticated.to(['read', 'write', 'delete'])],
    'sounds/*': [allow.authenticated.to(['read', 'write', 'delete'])],
    'themes/*': [allow.authenticated.to(['read', 'write', 'delete'])],
  }),
});
