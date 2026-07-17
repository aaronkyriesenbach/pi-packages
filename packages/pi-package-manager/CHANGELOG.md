# Changelog

## [0.2.0](https://github.com/aaronkyriesenbach/pi-package-manager/compare/pi-package-manager-v0.1.0...pi-package-manager-v0.2.0) (2026-07-17)


### Features

* add coverage audit ([0d26b65](https://github.com/aaronkyriesenbach/pi-package-manager/commit/0d26b652f077675e952ac8dd5f3900258fd5c305))
* add release-please/npm-publish CI, strict lint, 100% coverage ([baf2837](https://github.com/aaronkyriesenbach/pi-package-manager/commit/baf283702c9d8057b68507b68178e69da78afa67))
* complete test improvements ([65074ec](https://github.com/aaronkyriesenbach/pi-package-manager/commit/65074ecd3d5d8ec28d6c46ba3be148bce0b9cc93))
* hot-reload packages on /packages close via ctx.reload() ([fe5ac98](https://github.com/aaronkyriesenbach/pi-package-manager/commit/fe5ac98f4afb9ff99c90c39b9bf2aaf5fdcac915))
* initial commit ([52267ac](https://github.com/aaronkyriesenbach/pi-package-manager/commit/52267acadb09d8294778038babfce47ba9f4d4ae))
* per-session package enable/disable via 's' key in /packages ([09bacef](https://github.com/aaronkyriesenbach/pi-package-manager/commit/09bacefcd999c176dd8f3129d6eaf02ceebea1d5))
* pi-extmgr - Pi package manager extension ([c82fcc7](https://github.com/aaronkyriesenbach/pi-package-manager/commit/c82fcc75be36ba72cdfa9e16d1c4a6168ae14339))
* switch to bun, rename pi-package-manager ([2326d4b](https://github.com/aaronkyriesenbach/pi-package-manager/commit/2326d4bebba63cf2028023013916e485a39343c6))
* T8 — extract /packages command handler + fake API ([b48e6c1](https://github.com/aaronkyriesenbach/pi-package-manager/commit/b48e6c16467e4b9defd79660292084480612e1a7))
* T9 — integration test for full extension lifecycle ([9f6b2b0](https://github.com/aaronkyriesenbach/pi-package-manager/commit/9f6b2b0a2221a4d4235db1006e2070a5538fed23))
* update agents.md ([1a5d133](https://github.com/aaronkyriesenbach/pi-package-manager/commit/1a5d133f814d1a07c500fd8f1302138d573ec5b3))
* use /reload instead of shutdown after auto-update ([3dbb014](https://github.com/aaronkyriesenbach/pi-package-manager/commit/3dbb014903220645f4d473f9c022a634c2f9bae4))
* Wave 1 — fix lib test gaps, deduplicate helpers, extract fs-helpers and utils ([d60a062](https://github.com/aaronkyriesenbach/pi-package-manager/commit/d60a0620eb83bc69abcd4875fb22e1777ce04a64))
* Wave 2 — extract PackageListComponent, resolvePackageEntry, session handlers ([a60bc81](https://github.com/aaronkyriesenbach/pi-package-manager/commit/a60bc81c7eae5d4c40e895071f48fa3004451140))


### Bug Fixes

* assign this.settings before getPersistedEnabled in constructor ([e633e88](https://github.com/aaronkyriesenbach/pi-package-manager/commit/e633e887bd80d812f0d78679d422cd44ceee26b4))
* handle session scope properly ([3889403](https://github.com/aaronkyriesenbach/pi-package-manager/commit/3889403e39d073933cf9979dbd9ab4f388e362a7))
* point extension entry at index.ts instead of dist/index.js ([8f0299a](https://github.com/aaronkyriesenbach/pi-package-manager/commit/8f0299ac426b35ab6e0e7517d771e5fceaf69cb3))
* regenerate package-lock.json from the public registry ([657b4b3](https://github.com/aaronkyriesenbach/pi-package-manager/commit/657b4b34da83d4dc8bcd1d00224bb230244a0b0f))
* validate inputs in parseVersion and resolveFilterEntry ([2d8f485](https://github.com/aaronkyriesenbach/pi-package-manager/commit/2d8f4852d942d1a227f26298582ba0a3b3d4cb04))
* write effective session-override settings to disk before reload ([1c0acbb](https://github.com/aaronkyriesenbach/pi-package-manager/commit/1c0acbbc85fa9ba6ec527139d213b1d0336dd843))
