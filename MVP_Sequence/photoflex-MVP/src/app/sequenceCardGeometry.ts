export interface SequenceCardFrame {
  readonly width: number;
  readonly height: number;
}

const MAX_SEQUENCE_CARD_WIDTH = 360;
const MAX_SEQUENCE_CARD_HEIGHT = 400;
const FALLBACK_ASPECT_RATIO = 4 / 3;

/**
 * Fits the real photograph ratio inside the Sequence editor's visual bounds.
 * The result belongs to the photo rather than its current list position, so a
 * reorder cannot silently swap a landscape frame for a portrait frame.
 */
export function fitSequenceCardFrame(width: number, height: number): SequenceCardFrame {
  const validWidth = Number.isFinite(width) && width > 0 ? width : FALLBACK_ASPECT_RATIO;
  const validHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const scale = Math.min(MAX_SEQUENCE_CARD_WIDTH / validWidth, MAX_SEQUENCE_CARD_HEIGHT / validHeight);
  return {
    width: Math.round(validWidth * scale * 100) / 100,
    height: Math.round(validHeight * scale * 100) / 100,
  };
}

