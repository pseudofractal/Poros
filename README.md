<div align="center">
  <img src="static/logo.svg" alt="Poros Logo" width="120" />
  <h1>Poros</h1>
  <p><strong>A private, personal search launcher.</strong></p>
  <p><a href="https://pseudofractal.github.io/Poros/">Try it live</a></p>
</div>

Poros is a static web app that can be registered as a browser search engine. Search terms are resolved in your browser and redirected directly to the selected search provider. Custom engines and preferences remain in local storage.

## Features

- Search from the browser address bar or the Poros home page.
- Use built-in bang shortcuts or create custom engines and aliases.
- Select a default engine for searches without a bang.
- Configure optional query fields that add exact URL fragments when values are present.
- Choose Catppuccin Latte light or Catppuccin Mocha dark.
- Export and import versioned configuration files, with merge and replace modes.
- Install as a PWA and edit or resolve searches while offline.

## Browser search setup

Poros advertises itself using OpenSearch. In Firefox, visit the live site and use the address bar's search-engine menu to add Poros. In Chromium browsers, add a site search with a URL like:

```text
https://pseudofractal.github.io/Poros/?query=%s
```

## Development

Install Node.js and npm, then run:

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:4175/>. To create the static deployment build:

```sh
npm run build
```

The ready-to-deploy site is written to `dist/`.

## Performance benchmarks

Run `npm run bench` to build the app and collect local performance measurements. It opens fresh-profile headless Chromium sessions for the home and settings pages, recording app-ready time, first contentful paint, transferred bytes, resource count, and JavaScript heap size when Chromium exposes it. It also measures resolver speed and reports raw, gzip, and Brotli startup asset sizes for both routes.

Run `npm run bench:baseline` to save the current measurements to `benchmarks/baseline.json`. Later `npm run bench` runs report percentage changes against that reference. The baseline includes its machine, Node, and Chromium details; the report flags environment mismatches. Positive changes mean slower or larger, while negative changes mean faster or smaller.

`benchmarks/baseline-before-lazy-load.json` preserves the first measurement before settings and resolver code were moved off the initial route.

The home page loads only `styles.css`; `settings.css` loads when settings open. The service worker precaches both stylesheets so settings remain usable offline.

The benchmark uses `chromium` from `PATH`. Set `CHROMIUM_PATH` to use another Chromium executable, and `POROS_BENCH_SAMPLES` to change the default of seven samples per page. Browser startup and remote network latency are excluded; page timings measure the app itself over local loopback.

For real-world measurements, deploy the build first, then run `npm run bench:production`. It opens the deployed benchmark harness in fresh Chromium profiles and captures the same page metrics over the public network. Set `POROS_PRODUCTION_URL` for a different deployment. Run `npm run bench:production:baseline` after the first deployment to save a separate production reference. The harness is copied to `dist/benchmarks/` as part of each build.

The initial seven-sample public deployment baseline is saved in `benchmarks/production-baseline.json`.
