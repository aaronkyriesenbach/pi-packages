import { SettingsManager } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import defaultExport, {
  FROZEN_METHOD_NAMES,
  type FreezableSettingsTarget,
  freezeDefaults,
} from './index.js';

function buildWorkingStub(): FreezableSettingsTarget {
  return {
    setDefaultModel: vi.fn(),
    setDefaultProvider: vi.fn(),
    setDefaultModelAndProvider: vi.fn(),
    setDefaultThinkingLevel: vi.fn(),
  };
}

describe('freezeDefaults', () => {
  it('throws when a required method is missing from the target', () => {
    for (const missingMethod of FROZEN_METHOD_NAMES) {
      const stub = buildWorkingStub();
      stub[missingMethod] = undefined;

      expect(() => {
        freezeDefaults(stub);
      }).toThrow(`SettingsManager.prototype.${missingMethod}`);
    }
  });

  it('throws when a required method exists but is not a function', () => {
    const stub = buildWorkingStub();
    stub.setDefaultProvider = 'not-a-function';

    expect(() => {
      freezeDefaults(stub);
    }).toThrow(/setDefaultProvider/);
  });

  it('replaces every frozen method with a no-op that never calls the original', () => {
    const stub = buildWorkingStub();
    const originalSpies = { ...stub };

    freezeDefaults(stub);

    (stub.setDefaultModel as () => void)();
    (stub.setDefaultProvider as () => void)();
    (stub.setDefaultModelAndProvider as () => void)();
    (stub.setDefaultThinkingLevel as () => void)();

    for (const methodName of FROZEN_METHOD_NAMES) {
      expect(originalSpies[methodName]).not.toHaveBeenCalled();
    }
  });

  it('replaces methods with functions that accept arguments without throwing', () => {
    const stub = buildWorkingStub();

    freezeDefaults(stub);

    expect(() => {
      (stub.setDefaultModel as (modelId: string) => void)('claude-sonnet-4-5');
      (stub.setDefaultProvider as (provider: string) => void)('anthropic');
      (stub.setDefaultModelAndProvider as (provider: string, modelId: string) => void)(
        'anthropic',
        'claude-sonnet-4-5',
      );
      (stub.setDefaultThinkingLevel as (level: string) => void)('high');
    }).not.toThrow();
  });

  it('does not throw when the target already has every method frozen (idempotent)', () => {
    const stub = buildWorkingStub();

    freezeDefaults(stub);

    expect(() => {
      freezeDefaults(stub);
    }).not.toThrow();
  });
});

describe('freezeDefaults against the real SettingsManager (canary)', () => {
  it('stops setDefaultModel/setDefaultProvider/setDefaultModelAndProvider/setDefaultThinkingLevel from persisting', () => {
    freezeDefaults(SettingsManager.prototype);

    const settings = SettingsManager.inMemory();

    expect(settings.getDefaultModel()).toBeUndefined();
    expect(settings.getDefaultProvider()).toBeUndefined();
    expect(settings.getDefaultThinkingLevel()).toBeUndefined();

    settings.setDefaultModel('claude-sonnet-4-5');
    settings.setDefaultProvider('anthropic');
    settings.setDefaultModelAndProvider('anthropic', 'claude-sonnet-4-5');
    settings.setDefaultThinkingLevel('high');

    expect(settings.getDefaultModel()).toBeUndefined();
    expect(settings.getDefaultProvider()).toBeUndefined();
    expect(settings.getDefaultThinkingLevel()).toBeUndefined();
  });

  it('leaves unrelated SettingsManager behavior (e.g. theme) working normally', () => {
    freezeDefaults(SettingsManager.prototype);

    const settings = SettingsManager.inMemory();

    expect(settings.getTheme()).toBeUndefined();
    settings.setTheme('dark');
    expect(settings.getTheme()).toBe('dark');
  });
});

describe('default export (extension factory)', () => {
  it('freezes SettingsManager.prototype when invoked', () => {
    defaultExport();

    const settings = SettingsManager.inMemory();
    settings.setDefaultModel('claude-sonnet-4-5');

    expect(settings.getDefaultModel()).toBeUndefined();
  });
});
