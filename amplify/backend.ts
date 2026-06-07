import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { triggerBuild } from './functions/trigger-build/resource';

const backend = defineBackend({ auth, data, storage, triggerBuild });

// Injecter l'endpoint AppSync dans la Lambda via les ressources CloudFormation.
// Les interfaces IFunction / IGraphqlApi n'exposent pas addEnvironment / graphqlUrl —
// on passe par cfnResources pour accéder aux constructs CDK concrets.
backend.triggerBuild.resources.cfnResources.cfnFunction.addPropertyOverride(
  'Environment.Variables.AMPLIFY_DATA_GRAPHQL_ENDPOINT',
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl,
);

export { backend };
