
export interface Frame {
  id: string;
  dataUrl: string;
  timestamp: number;
}

export interface AnimationProject {
  id: string;
  name: string;
  frames: Frame[];
  fps: number;
}

export interface ChromaKeyConfig {
  color: { r: number; g: number; b: number };
  hex: string;
  tolerance: number;
  backgroundUrl: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PLAYBACK = 'PLAYBACK',
  PROCESSING = 'PROCESSING'
}
