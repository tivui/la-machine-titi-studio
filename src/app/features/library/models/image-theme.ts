export interface Sound {
  name: string;
  filename: string;
  isSystem: boolean;
  durationSec?: number;
}

export interface ImageTheme {
  id: string;
  name: string;
  description: string;
  buildDate: Date;
  sounds: Sound[];
  s3Key: string;
  isOriginal: boolean;
  sizeKb?: number;
  choreographyThemeId?: string;
}
