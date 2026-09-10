/** The ASR port: voice notes in, text out. Vendors stay behind this. */
export interface AsrResult {
  text: string;
  confidence?: number;
}

export interface AsrAdapter {
  readonly id: string;
  /** audioRef is the channel-native media reference (P5 InboundMessage). */
  transcribe(audioRef: string): Promise<AsrResult>;
}
