import { describe, expect, test } from 'bun:test';
import {
  computeStreamingThrottleDelay,
  DEFAULT_STREAMING_TEXT_THROTTLE_MS,
} from './useStreamingTextThrottle';

describe('computeStreamingThrottleDelay', () => {
  test('uses the configured default throttle interval', () => {
    expect(DEFAULT_STREAMING_TEXT_THROTTLE_MS).toBe(16);
  });

  test('returns zero when the throttle window has elapsed', () => {
    expect(computeStreamingThrottleDelay(100, 150, 16)).toBe(0);
  });

  test('returns remaining delay inside the throttle window', () => {
    expect(computeStreamingThrottleDelay(100, 110, 16)).toBe(6);
  });
});
