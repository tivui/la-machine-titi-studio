import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  ImageTheme: a
    .model({
      name:        a.string().required(),
      description: a.string(),
      buildDate:   a.datetime(),
      s3Key:       a.string().required(),
      isOriginal:  a.boolean().default(false),
      sizeKb:      a.integer(),
      sounds:      a.hasMany('Sound', 'imageThemeId'),
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
