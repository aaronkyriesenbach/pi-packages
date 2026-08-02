# Changelog

## [0.3.1](https://github.com/aaronkyriesenbach/pi-packages/compare/pi-package-manager-v0.3.0...pi-package-manager-v0.3.1) (2026-08-02)


### Bug Fixes

* correct dev test command from bun test to bun run test ([1af8595](https://github.com/aaronkyriesenbach/pi-packages/commit/1af859599f512fe88053802133db6ea8fdd7d8f7))

## [0.3.0](https://github.com/aaronkyriesenbach/pi-packages/compare/pi-package-manager-v0.2.0...pi-package-manager-v0.3.0) (2026-08-02)


### Features

* add coverage audit ([0c72c55](https://github.com/aaronkyriesenbach/pi-packages/commit/0c72c555277395d19dda895cdbfafdecf7ad92fe))
* add release-please/npm-publish CI, strict lint, 100% coverage ([5a090b5](https://github.com/aaronkyriesenbach/pi-packages/commit/5a090b57c8b91c254364ca77786a94775d185514))
* complete test improvements ([2ecf342](https://github.com/aaronkyriesenbach/pi-packages/commit/2ecf342738eb4f96f69def4884c30ddbf94867b9))
* hot-reload packages on /packages close via ctx.reload() ([bb04833](https://github.com/aaronkyriesenbach/pi-packages/commit/bb048334153b80ae0c5e86e627943c773a53886c))
* initial commit ([63c7ba5](https://github.com/aaronkyriesenbach/pi-packages/commit/63c7ba5fd14dd0797e2ebe7b518998bb108e4b20))
* migrate pi-package-manager into the monorepo ([88fbd2a](https://github.com/aaronkyriesenbach/pi-packages/commit/88fbd2a68567bde10469ceb939d09611795bf441))
* migrate to Bun (runtime, lockfile, CI) ([4b0bf75](https://github.com/aaronkyriesenbach/pi-packages/commit/4b0bf752b00bd8dca071d779c6278f3da134d0b6))
* per-session package enable/disable via 's' key in /packages ([3708b40](https://github.com/aaronkyriesenbach/pi-packages/commit/3708b40cd8c96855a84498bfc4c0aca2b2139b53))
* pi-extmgr - Pi package manager extension ([a4dbafe](https://github.com/aaronkyriesenbach/pi-packages/commit/a4dbafeb95d9f43f9f9a28431e3a39f35e444265))
* switch to bun, rename pi-package-manager ([852d087](https://github.com/aaronkyriesenbach/pi-packages/commit/852d0877c8853b0314220c844a29f41da1aa4abd))
* T8 — extract /packages command handler + fake API ([ae1709f](https://github.com/aaronkyriesenbach/pi-packages/commit/ae1709f5c6cd7afefcbc61cad0570b4d3c7867e4))
* T9 — integration test for full extension lifecycle ([f4eabe2](https://github.com/aaronkyriesenbach/pi-packages/commit/f4eabe2427c156836d483dee75aa70b37d8622fe))
* update agents.md ([44c2d95](https://github.com/aaronkyriesenbach/pi-packages/commit/44c2d956a43eaf014958efb2028ee0733945c534))
* use /reload instead of shutdown after auto-update ([4925c10](https://github.com/aaronkyriesenbach/pi-packages/commit/4925c10559cc3ae7fd7f26e404803ca7c2719eb5))
* Wave 1 — fix lib test gaps, deduplicate helpers, extract fs-helpers and utils ([b65857b](https://github.com/aaronkyriesenbach/pi-packages/commit/b65857bfbf647079b91e9d5ae8be93923affb7d4))
* Wave 2 — extract PackageListComponent, resolvePackageEntry, session handlers ([3cc66b4](https://github.com/aaronkyriesenbach/pi-packages/commit/3cc66b4b0096dc21c05c08f550be52e7cf247a0d))


### Bug Fixes

* assign this.settings before getPersistedEnabled in constructor ([baf11f0](https://github.com/aaronkyriesenbach/pi-packages/commit/baf11f00e45a9cfe22839ddb6760d56085d86108))
* handle session scope properly ([c4cc9a7](https://github.com/aaronkyriesenbach/pi-packages/commit/c4cc9a7e45e7e9f6fd6538151e3701640c93b30d))
* point extension entry at index.ts instead of dist/index.js ([7e76bf5](https://github.com/aaronkyriesenbach/pi-packages/commit/7e76bf520c9fc5233ba9b4aa1197350178d65735))
* regenerate package-lock.json from the public registry ([b049ceb](https://github.com/aaronkyriesenbach/pi-packages/commit/b049cebb8b7ce88174e2133ad99aa2127cb67ec7))
* validate inputs in parseVersion and resolveFilterEntry ([c57230d](https://github.com/aaronkyriesenbach/pi-packages/commit/c57230de9d555f8c7627056b5a8aa1d13a2d2b71))
* write effective session-override settings to disk before reload ([7f9cd91](https://github.com/aaronkyriesenbach/pi-packages/commit/7f9cd91beae086e5d596a1cfc3d7463e419d57ae))

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
