/**
 * The Channel port. Core never sees a vendor webhook shape — every surface
 * (WhatsApp, SMS, PWA chat, mock) normalizes to InboundMessage and sends
 * through OutboundMessage (BUILD §2, Channel Adapter pack).
 */

export type InboundKind = 'text' | 'voice' | 'image' | 'tap';

export interface InboundMessage {
  /** Channel-native message id — the idempotency key for processing. */
  id: string;
  channel: string;
  /** Sender address in channel-native form (E.164 for whatsapp/sms). */
  from: string;
  kind: InboundKind;
  text?: string;
  /** Channel-native media reference for voice/image. */
  mediaRef?: string;
  /** Payload of the tapped button/list row. */
  tapPayload?: string;
  receivedAt: string;
}

export interface OutboundMessage {
  to: string;
  text: string;
}

export interface ChannelAdapter {
  readonly id: string;
  /** MUST verify against the raw body bytes, before any parsing. */
  verifySignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean;
  parseInbound(rawBody: Buffer): InboundMessage[];
  send(message: OutboundMessage): Promise<void>;
}
