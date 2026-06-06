import { defineFunction, secret } from '@aws-amplify/backend';

export const triggerBuild = defineFunction({
  name: 'triggerBuild',
  entry: './handler.ts',
  environment: {
    GITHUB_TOKEN:     secret('GITHUB_TOKEN'),
    AMPLIFY_API_KEY:  secret('AMPLIFY_API_KEY'),
  },
  timeoutSeconds: 30,
});
