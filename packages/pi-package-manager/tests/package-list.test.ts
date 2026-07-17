import { describe, it, expect, vi } from 'vitest';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { PackageListComponent } from '../lib/package-list';
import type { PackageInfo, Settings } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTheme: Theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function makePackage(overrides: Partial<PackageInfo> = {}): PackageInfo {
  return {
    name: 'pi-lens',
    source: 'npm:pi-lens',
    version: '3.8.67',
    enabled: true,
    resources: {
      extensions: ['./dist/index.js'],
      skills: [],
      prompts: [],
      themes: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildViewModel
// ---------------------------------------------------------------------------

describe('buildViewModel', () => {
  it('returns empty rows and isEmpty=true when no packages', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, onClose);
    const vm = comp.buildViewModel();
    expect(vm.rows).toEqual([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.autoUpdateEnabled).toBe(true);
  });

  it('returns one enabled row for a single enabled package', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      onClose,
    );
    const vm = comp.buildViewModel();
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0].name).toBe('pi-lens');
    expect(vm.rows[0].version).toBe('3.8.67');
    expect(vm.rows[0].enabled).toBe(true);
    expect(vm.rows[0].hasPending).toBe(false);
    expect(vm.rows[0].selected).toBe(true); // first item selected
  });

  it('returns a disabled row for a disabled package', () => {
    const settings: Settings = {
      packages: [
        {
          source: 'npm:pi-lens',
          extensions: [],
          skills: [],
          prompts: [],
          themes: [],
        },
      ],
    };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent(
      [makePackage({ enabled: false })],
      settings,
      true,
      overrides,
      mockTheme,
      onClose,
    );
    const vm = comp.buildViewModel();
    expect(vm.rows[0].enabled).toBe(false);
  });

  it('reflects selectedIndex as selection', () => {
    const settings: Settings = { packages: ['npm:pi-lens', 'npm:other'] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent(
      [
        makePackage({ name: 'pi-lens', source: 'npm:pi-lens' }),
        makePackage({ name: 'other', source: 'npm:other' }),
      ],
      settings,
      true,
      overrides,
      mockTheme,
      onClose,
    );

    // First item selected by default
    expect(comp.buildViewModel().rows[0].selected).toBe(true);
    expect(comp.buildViewModel().rows[1].selected).toBe(false);

    // Navigate down
    comp.handleInput('\x1b[B');
    expect(comp.buildViewModel().rows[0].selected).toBe(false);
    expect(comp.buildViewModel().rows[1].selected).toBe(true);
  });

  it('shows hasPending when toggled without persist', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      onClose,
    );

    // Toggle off
    comp.handleInput(' ');
    const vm = comp.buildViewModel();
    expect(vm.rows[0].enabled).toBe(false); // toggled off via session override
    expect(vm.rows[0].hasPending).toBe(true); // differs from persisted
  });

  it('reports autoUpdateEnabled correctly', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();

    const compOn = new PackageListComponent([], settings, true, overrides, mockTheme, vi.fn());
    expect(compOn.buildViewModel().autoUpdateEnabled).toBe(true);

    const compOff = new PackageListComponent([], settings, false, overrides, mockTheme, vi.fn());
    expect(compOff.buildViewModel().autoUpdateEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleInput
// ---------------------------------------------------------------------------

describe('handleInput', () => {
  it('escape triggers onClose', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, onClose);

    comp.handleInput('\x1b');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({
      settings,
      autoUpdateEnabled: true,
      discarded: false,
    });
  });

  it('enter triggers onClose', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, onClose);

    comp.handleInput('\r');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({
      settings,
      autoUpdateEnabled: true,
      discarded: false,
    });
  });

  it('return triggers onClose', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, onClose);

    comp.handleInput('\r');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('j navigates down and wraps', () => {
    const settings: Settings = { packages: ['npm:a', 'npm:b'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ name: 'a', source: 'npm:a' }), makePackage({ name: 'b', source: 'npm:b' })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    expect(comp.buildViewModel().rows[0].selected).toBe(true);
    comp.handleInput('j');
    expect(comp.buildViewModel().rows[1].selected).toBe(true);
    comp.handleInput('j');
    expect(comp.buildViewModel().rows[0].selected).toBe(true); // wraps
  });

  it('k navigates up and wraps', () => {
    const settings: Settings = { packages: ['npm:a', 'npm:b'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ name: 'a', source: 'npm:a' }), makePackage({ name: 'b', source: 'npm:b' })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Start at index 0, navigate up wraps to last
    comp.handleInput('k');
    expect(comp.buildViewModel().rows[1].selected).toBe(true);
    comp.handleInput('k');
    expect(comp.buildViewModel().rows[0].selected).toBe(true); // wraps
  });

  it('down and up are equivalent to j and k', () => {
    const settings: Settings = { packages: ['npm:a', 'npm:b'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ name: 'a', source: 'npm:a' }), makePackage({ name: 'b', source: 'npm:b' })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    comp.handleInput('\x1b[B');
    expect(comp.buildViewModel().rows[1].selected).toBe(true);
    comp.handleInput('\x1b[A');
    expect(comp.buildViewModel().rows[0].selected).toBe(true);
  });

  it('space toggles enabled state on selected package', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    expect(comp.buildViewModel().rows[0].enabled).toBe(true);

    comp.handleInput(' ');
    expect(comp.buildViewModel().rows[0].enabled).toBe(false);

    comp.handleInput(' ');
    expect(comp.buildViewModel().rows[0].enabled).toBe(true);
  });

  it('space sets session override when new state differs from persisted', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Toggle off — should set override
    comp.handleInput(' ');
    expect(overrides.get('npm:pi-lens')).toBe(false);
  });

  it('space clears session override when new state matches persisted', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>([['npm:pi-lens', false]]); // already has override
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Package starts enabled in the component (though overridden to disabled)
    // Toggle off first: sets override to false (matches existing)
    comp.handleInput(' ');
    // Override is still set (false matches existing, but we still set it)
    expect(overrides.get('npm:pi-lens')).toBe(false);

    // Toggle on: enabled returns to true, which matches persisted (true) → clear override
    comp.handleInput(' ');
    expect(overrides.has('npm:pi-lens')).toBe(false);
  });

  it('p calls persistState', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Toggle off first
    comp.handleInput(' ');
    expect(overrides.get('npm:pi-lens')).toBe(false);

    // Persist
    comp.handleInput('p');

    // Overrides should be cleared after persist
    expect(overrides.size).toBe(0);
    // The settings.packages should now have pi-lens disabled
    expect(settings.packages).toEqual([
      {
        source: 'npm:pi-lens',
        extensions: [],
        skills: [],
        prompts: [],
        themes: [],
      },
    ]);
  });

  it('u toggles autoUpdateEnabled', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, vi.fn());

    expect(comp.buildViewModel().autoUpdateEnabled).toBe(true);
    comp.handleInput('u');
    expect(comp.buildViewModel().autoUpdateEnabled).toBe(false);
    comp.handleInput('u');
    expect(comp.buildViewModel().autoUpdateEnabled).toBe(true);
  });

  it('keyboard operations on empty list are no-ops', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, onClose);

    // These should not throw or change anything
    comp.handleInput('j');
    comp.handleInput('k');
    comp.handleInput(' ');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('treats a package absent from settings as persisted-enabled', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Toggling off should set a session override, since the persisted
    // default (true, because the package isn't in settings at all) differs
    // from the new state.
    comp.handleInput(' ');
    expect(overrides.get('npm:pi-lens')).toBe(false);
  });

  it('escape discards session overrides made without persisting (hasPending)', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const onClose = vi.fn();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      onClose,
    );

    comp.handleInput(' '); // toggle off, creating a pending session override
    comp.handleInput('\x1b'); // escape

    expect(onClose).toHaveBeenCalledWith({
      settings,
      autoUpdateEnabled: true,
      discarded: true,
    });
  });

  it('persistState skips packages that have no matching settings entry', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // No matching entry in settings.packages — persistState should skip it
    // without throwing, and settings.packages stays untouched.
    comp.handleInput('p');
    expect(settings.packages).toEqual([]);
  });

  it('persistState toggles packages resolved from a PackageFilter entry', () => {
    const settings: Settings = {
      packages: [
        {
          source: 'npm:pi-lens',
          extensions: [],
          skills: [],
          prompts: [],
          themes: [],
        },
      ],
    };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ enabled: false })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Toggle on (differs from the all-empty-resources persisted state)
    comp.handleInput(' ');
    comp.handleInput('p');

    expect(settings.packages).toEqual(['npm:pi-lens']);
  });

  it('falls back to an empty package list when settings.packages is undefined', () => {
    const settings: Settings = {};
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    // Persisted default is "enabled" since there's no settings.packages at
    // all to look the source up in — exercises the `?? []` fallback in both
    // getPersistedEnabled (constructor) and persistState.
    comp.handleInput(' '); // toggle off — differs from persisted true
    expect(overrides.get('npm:pi-lens')).toBe(false);

    comp.handleInput('p'); // persistState also falls back to `?? []`
    expect(overrides.size).toBe(0);
  });
});

describe('render', () => {
  it('shows the empty-state message when there are no packages', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent([], settings, true, overrides, mockTheme, vi.fn());

    const lines = comp.render(80).join('\n');
    expect(lines).toContain('Pi Packages');
    expect(lines).toContain('No packages installed.');
  });

  it('renders a row per package with name, version, and status', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80).join('\n');
    expect(lines).toContain('pi-lens');
    expect(lines).toContain('@3.8.67');
    expect(lines).toContain('enabled');
  });

  it('renders the cursor only on the selected row when multiple packages exist', () => {
    const settings: Settings = { packages: ['npm:a', 'npm:b'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ name: 'a', source: 'npm:a' }), makePackage({ name: 'b', source: 'npm:b' })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80);
    const rowA = lines.find((l) => l.includes('a@'));
    const rowB = lines.find((l) => l.includes('b@'));
    expect(rowA?.trimStart().startsWith('>')).toBe(true);
    expect(rowB?.trimStart().startsWith('>')).toBe(false);
  });

  it('shows disabled status for a disabled package', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage({ enabled: false })],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80).join('\n');
    expect(lines).toContain('disabled');
  });

  it('renders resource tags for a package exposing every resource kind', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [
        makePackage({
          resources: {
            extensions: ['./ext.js'],
            skills: ['./skill'],
            prompts: ['./prompt'],
            themes: ['./theme'],
          },
        }),
      ],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80).join('\n');
    expect(lines).toContain('ext');
    expect(lines).toContain('skills');
    expect(lines).toContain('prompts');
    expect(lines).toContain('themes');
  });

  it('omits the resource tag list for a package with no resources', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [
        makePackage({
          resources: { extensions: [], skills: [], prompts: [], themes: [] },
        }),
      ],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80);
    expect(lines.some((l) => l.includes('('))).toBe(false);
  });

  it('shows the session-only hint when a pending override exists', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    comp.handleInput(' '); // create a pending session override
    const lines = comp.render(80).join('\n');
    expect(lines).toContain('Session-only toggles revert');
  });

  it('does not show the session-only hint when nothing is pending', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const lines = comp.render(80).join('\n');
    expect(lines).not.toContain('Session-only toggles revert');
  });

  it('shows auto-update on/off status', () => {
    const settings: Settings = { packages: [] };
    const overrides = new Map<string, boolean>();

    const compOn = new PackageListComponent([], settings, true, overrides, mockTheme, vi.fn());
    expect(compOn.render(80).join('\n')).toContain('auto-update on');

    const compOff = new PackageListComponent([], settings, false, overrides, mockTheme, vi.fn());
    expect(compOff.render(80).join('\n')).toContain('auto-update off');
  });

  it('caches rendered lines for the same width', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const first = comp.render(80);
    const second = comp.render(80);
    expect(second).toBe(first); // same cached array reference
  });

  it('recomputes rendered lines after invalidation from a state change', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const first = comp.render(80);
    comp.handleInput(' '); // toggles state — invalidates the cache
    const second = comp.render(80);
    expect(second).not.toBe(first);
  });

  it('recomputes rendered lines when the width changes', () => {
    const settings: Settings = { packages: ['npm:pi-lens'] };
    const overrides = new Map<string, boolean>();
    const comp = new PackageListComponent(
      [makePackage()],
      settings,
      true,
      overrides,
      mockTheme,
      vi.fn(),
    );

    const first = comp.render(80);
    const second = comp.render(120);
    expect(second).not.toBe(first);
  });
});
