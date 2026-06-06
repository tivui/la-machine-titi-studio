import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { triggerBuild } from '../functions/trigger-build/resource';

const schema = a.schema({
  ImageTheme: a
    .model({
      name:                a.string().required(),
      description:         a.string(),
      buildDate:           a.datetime(),
      s3Key:               a.string().required(),
      isOriginal:          a.boolean().default(false),
      sizeKb:              a.integer(),
      choreographyThemeId: a.id(),   // FK vers le ChoreographyTheme source (null = image officielle)
      sounds:              a.hasMany('Sound', 'imageThemeId'),
    })
    // authenticated() pour l'app, publicApiKey() pour le script seed (dev uniquement)
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()]),

  Sound: a
    .model({
      imageThemeId: a.id().required(),
      name:         a.string().required(),
      filename:     a.string().required(),
      isSystem:     a.boolean().default(false),
      durationSec:  a.float(),
      imageTheme:   a.belongsTo('ImageTheme', 'imageThemeId'),
    })
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()]),

  // ── Bibliothèque de chorégraphies ───────────────────────────────────────────

  ChoreographyTheme: a
    .model({
      name:           a.string().required(),
      description:    a.string(),
      emoji:          a.string(),
      isBuiltIn:      a.boolean().default(false),
      choreographies: a.hasMany('ChoreographyRecord', 'themeId'),
    })
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()]),

  ChoreographyRecord: a
    .model({
      themeId:         a.id().required(),
      name:            a.string().required(),
      description:     a.string(),
      mp3File:         a.string(),
      mp3DurationMs:   a.integer(),
      servoPointsJson: a.string(),   // JSON.stringify(ServoPoint[])
      theme:           a.belongsTo('ChoreographyTheme', 'themeId'),
    })
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()]),

  // ── Build jobs ──────────────────────────────────────────────────────────────

  BuildJob: a
    .model({
      themeId:       a.id().required(),
      themeName:     a.string().required(),
      // 'queued' | 'running' | 'success' | 'failed'
      status:        a.string().required(),
      workflowRunId: a.string(),   // ID du run GitHub Actions
      startedAt:     a.datetime(),
      completedAt:   a.datetime(),
      errorMessage:  a.string(),
      imageS3Key:    a.string(),   // "images/{themeId}/la_machine.img" si success
    })
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()]),

  // ── Mutation custom : déclencher un build d'image firmware ─────────────────

  TriggerBuildResult: a.customType({
    buildJobId:  a.string(),
    workflowUrl: a.string(),
  }),

  triggerBuild: a
    .mutation()
    .arguments({
      themeId:           a.string().required(),
      themeName:         a.string().required(),
      choreographiesB64: a.string().required(),
    })
    .returns(a.ref('TriggerBuildResult'))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(triggerBuild)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    // Clé API pour le script seed et les appels non-authentifiés (développement)
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
