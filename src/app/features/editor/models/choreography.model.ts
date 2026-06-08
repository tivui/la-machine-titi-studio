export interface ServoPoint {
  id: string;
  timeMs: number;
  position: number;
  durationMs: number;
}

export interface Choreography {
  id: string;
  themeId: string;
  name: string;
  mp3File: string;
  mp3DurationMs: number;
  servoPoints: ServoPoint[];
  volume?: number; // 0-100, undefined = 100 (défaut)
}

export interface ChoreographyTheme {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isBuiltIn: boolean;
  imageS3Key?: string;
}
