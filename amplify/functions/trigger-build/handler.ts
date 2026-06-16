// AppSync pipeline resolver — invoked by the triggerBuild custom mutation.
// Environment variables (injected by Amplify):
//   AMPLIFY_DATA_GRAPHQL_ENDPOINT  — auto-injected when used as a.handler.function()
//   AMPLIFY_API_KEY                — publicApiKey for AppSync (Amplify secret)
//   GITHUB_TOKEN                   — PAT with 'workflow' scope (Amplify secret)

import type { AppSyncResolverHandler } from 'aws-lambda';

interface TriggerBuildArgs {
  themeId: string;
  themeName: string;
  choreographiesB64: string;
}

interface TriggerBuildResult {
  buildJobId: string;
  workflowUrl: string;
}

const GITHUB_REPO   = 'tivui/la-machine-titi';
const WORKFLOW_FILE = 'build-custom.yaml';
const WORKFLOW_REF  = 'custom/mes_sons';

// AWS_BRANCH is set by Amplify Hosting CI/CD — absent during local sandbox.
const GITHUB_ENV = process.env['AWS_BRANCH'] ? 'production' : 'sandbox';

export const handler: AppSyncResolverHandler<TriggerBuildArgs, TriggerBuildResult> = async (event) => {
  const { themeId, themeName, choreographiesB64 } = event.arguments;

  const githubToken  = process.env['GITHUB_TOKEN'];
  const apiKey       = process.env['AMPLIFY_API_KEY'];
  const apiEndpoint  = process.env['AMPLIFY_DATA_GRAPHQL_ENDPOINT'];

  if (!githubToken)  throw new Error('GITHUB_TOKEN secret not configured');
  if (!apiKey)       throw new Error('AMPLIFY_API_KEY secret not configured');
  if (!apiEndpoint)  throw new Error('AMPLIFY_DATA_GRAPHQL_ENDPOINT not available');

  const buildJobId = crypto.randomUUID();
  const now        = new Date().toISOString();

  // Create BuildJob record via AppSync
  const createRes = await appsyncMutation(apiEndpoint, apiKey, /* GraphQL */ `
    mutation CreateBuildJob($input: CreateBuildJobInput!) {
      createBuildJob(input: $input) { id status }
    }
  `, { input: { id: buildJobId, themeId, themeName, status: 'queued', startedAt: now } });

  if (!createRes.ok) {
    throw new Error(`AppSync CreateBuildJob failed: ${createRes.status}`);
  }

  // Trigger GitHub Actions workflow
  const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  const ghRes = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Authorization':        `Bearer ${githubToken}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
    },
    body: JSON.stringify({
      ref: WORKFLOW_REF,
      inputs: {
        theme_id:           themeId,
        theme_name:         themeName,
        choreographies_b64: choreographiesB64,
        build_job_id:       buildJobId,
        environment:        GITHUB_ENV,
      },
    }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text();
    await appsyncMutation(apiEndpoint, apiKey, /* GraphQL */ `
      mutation UpdateBuildJob($input: UpdateBuildJobInput!) {
        updateBuildJob(input: $input) { id }
      }
    `, {
      input: { id: buildJobId, status: 'failed', errorMessage: `GitHub dispatch error: ${errText}`, completedAt: new Date().toISOString() },
    }).catch(() => {});
    throw new Error(`GitHub Actions dispatch failed (${ghRes.status}): ${errText}`);
  }

  const workflowUrl = `https://github.com/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`;
  return { buildJobId, workflowUrl };
};

function appsyncMutation(endpoint: string, apiKey: string, query: string, variables: unknown): Promise<Response> {
  return fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body:    JSON.stringify({ query, variables }),
  });
}
