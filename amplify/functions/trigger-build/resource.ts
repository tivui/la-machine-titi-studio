import { defineFunction, secret } from '@aws-amplify/backend';

export const triggerBuild = defineFunction({
  name: 'triggerBuild',
  entry: './handler.ts',
  resourceGroupName: 'data',   // même stack que data pour éviter la dépendance circulaire
  environment: {
    GITHUB_TOKEN:     secret('GITHUB_TOKEN'),
    AMPLIFY_API_KEY:  secret('AMPLIFY_API_KEY'),
  },
  timeoutSeconds: 30,
});
