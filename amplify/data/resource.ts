import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  ImageTheme: a
    .model({
      name: a.string().required(),
      description: a.string(),
      buildDate: a.datetime(),
      s3Key: a.string().required(),
      isOriginal: a.boolean().default(false),
      sizeKb: a.integer(),
      sounds: a.hasMany('Sound', 'imageThemeId'),
    })
    .authorization(allow => [allow.authenticated()]),

  Sound: a
    .model({
      imageThemeId: a.id().required(),
      name: a.string().required(),
      filename: a.string().required(),
      isSystem: a.boolean().default(false),
      durationSec: a.float(),
      imageTheme: a.belongsTo('ImageTheme', 'imageThemeId'),
    })
    .authorization(allow => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
