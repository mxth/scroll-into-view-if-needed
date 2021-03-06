export interface ScrollIntoViewIfNeededOptions {
  centerIfNeeded?: boolean;
  duration?: number;
  easing?: 'ease' | 'easeIn' | 'easeOut' | 'easeInOut' | 'linear';
}

export default function scrollIntoViewIfNeeded(
  node: Element,
  centerIfNeeded: boolean,
  options?: ScrollIntoViewIfNeededOptions,
  finalElement?: Element
): void;
