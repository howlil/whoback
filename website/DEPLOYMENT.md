# MyPaaS deployment

Create this site as a static project with the repository root as the source and
the following settings:

- Deploy mode: `static`
- Resource profile: `static`
- Base directory: `website`
- Static frontend path: empty
- App port: not required

MyPaaS will run the `build` script in this directory using the declared pnpm
version, then publish `dist/index.html` and the generated assets through its
static hosting path.

Local verification:

```bash
pnpm install --frozen-lockfile
pnpm run build
```
