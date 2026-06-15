# Third-Party Licenses

Vibemesh-AI's own source code is licensed under the [MIT License](LICENSE). It
bundles and/or depends on third-party components under their own licenses,
listed below. If you redistribute Vibemesh-AI (including the built `dist/`), you
must honor these licenses too.

## ⚠️ OpenSCAD — GPL-2.0 (copyleft)

Vibemesh-AI renders geometry with [`openscad-wasm`](https://www.npmjs.com/package/openscad-wasm),
a WebAssembly build of **OpenSCAD**. OpenSCAD is licensed under the
**GNU General Public License v2.0** (GPL-2.0).

- The WASM module is bundled into the production build (base64-embedded in a JS
  chunk by `src/lib/openscad/worker.ts`).
- OpenSCAD runs as a **separate, self-contained program** invoked at arm's
  length via its CLI entry point (`callMain([...])`) — Vibemesh-AI does not link
  OpenSCAD source into its own code. Vibemesh-AI therefore treats this as
  *aggregation / invoking a separate program*, which is why Vibemesh-AI's own code
  can be MIT-licensed while the bundled OpenSCAD component remains under GPL-2.0.
- The OpenSCAD source (and the openscad-wasm build scripts) are publicly
  available upstream; the GPL-2.0 obligations (source availability, no added
  restrictions on the GPL component) are satisfied by that upstream availability.
- OpenSCAD: https://github.com/openscad/openscad · openscad-wasm: https://github.com/openscad/openscad-wasm
- The full GPL-2.0 license text is bundled at [`LICENSES/GPL-2.0.txt`](LICENSES/GPL-2.0.txt).
- **Provenance note:** the `openscad-wasm` npm package (v0.0.4) is a third-party build
  published by an individual maintainer, **not** an official `openscad-org` npm release.
  It is pinned by exact integrity hash in `package-lock.json`. The GitHub links above are
  the canonical GPL-2.0 source reference; for maximum provenance you may vendor a WASM
  built from a documented upstream release with a recorded checksum.

> Not legal advice. If you plan to ship a closed-source or commercial product
> built on Vibemesh-AI, review the GPL-2.0 implications of bundling OpenSCAD for
> your specific distribution before doing so.

## Permissive dependencies

All other runtime/build dependencies are under permissive licenses (MIT / ISC /
Apache-2.0 / BSD), which require only attribution. Key ones:

| Package | License |
|---|---|
| react, react-dom | MIT |
| three, @react-three/fiber, @react-three/drei | MIT |
| zustand | MIT |
| express | MIT |
| fflate | MIT |
| @anthropic-ai/sdk | MIT |
| vite, typescript, eslint | MIT / Apache-2.0 |

## Proprietary — @anthropic-ai/claude-agent-sdk

[`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
is **not** MIT — it is proprietary (© Anthropic PBC, All Rights Reserved; terms:
https://code.claude.com/docs/en/legal-and-compliance). It is used **server-side only**
(a dynamic `import()` in `server/providers.mjs`) to power the optional **Claude · login**
engine and is **not bundled into the redistributed frontend** (`dist/` / the GitHub Pages
demo contains no proprietary code). The Claude-login engine is for personal/local use only
per Anthropic's Agent SDK terms; a distributed or multi-user build should use the API-key
engines (`anthropic` / `kimi`) instead.

Generate a full, current dependency-license report any time with:

```sh
npx license-checker --summary        # counts by license
npx license-checker --production     # per-package detail (prod deps)
```
