import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { triggerBuild } from './functions/trigger-build/resource';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';

const backend = defineBackend({ auth, data, storage, triggerBuild });

// ── CORS sur le bucket S3 ──────────────────────────────────────────────────────
// Nécessaire pour que fetch() dans l'éditeur puisse lire les sons depuis localhost
// et depuis les domaines Amplify Hosting (amplifyapp.com).
const cfnBucket = backend.storage.resources.bucket.node.defaultChild as CfnBucket;
cfnBucket.addPropertyOverride('CorsConfiguration', {
  CorsRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedOrigins: ['http://localhost:4200', 'https://*.amplifyapp.com'],
      MaxAge: 3000,
    },
  ],
});

// ── Lambda triggerBuild — endpoint AppSync ────────────────────────────────────
// Les interfaces IFunction / IGraphqlApi n'exposent pas addEnvironment / graphqlUrl —
// on passe par cfnResources pour accéder aux constructs CDK concrets.
backend.triggerBuild.resources.cfnResources.cfnFunction.addPropertyOverride(
  'Environment.Variables.AMPLIFY_DATA_GRAPHQL_ENDPOINT',
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl,
);

export { backend };
