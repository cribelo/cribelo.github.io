# cribelo.github.io

The website of [Cribelo](https://github.com/cribelo/cribelo). One HTML page in `public/`, no build step. Every push to `main` deploys it to GitHub Pages.

```sh
python3 -m http.server -d public 8000
```

The sample outputs on the page are real runs of the binary on the AST Metrics repository. Rerun them rather than editing the numbers by hand.

`public/install.sh` does not live here: the deploy job copies it from the main repository, so rerun the job after changing the installer.
