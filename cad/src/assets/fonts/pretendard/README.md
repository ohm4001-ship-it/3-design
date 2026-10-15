# Bundled Pretendard

Pretendard **v1.3.9**, regular 400 and bold 700 static WOFF2, from the official tagged distribution:

- https://github.com/orioncactus/pretendard/releases/tag/v1.3.9
- https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2
- https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2
- https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE

Unmodified files, downloaded 2026-10-15. SHA-256:

| File | SHA-256 |
|---|---|
| Pretendard-Regular.woff2 | fad853f7f47c6c8b103171e7193fa095708cdcd70850a71d93aa5379e8a61d63 |
| Pretendard-Bold.woff2 | 4609c3356e536fafe38f4add0daeceb3d8595d3057bce13c428c33ddbd43d362 |
| LICENSE.txt | d31ddd9f2bed32fd7e302a205cf2380ba0de6529152d239ef99cfb6f261bfc04 |

Retain `LICENSE.txt` with redistributed font files. The Vite build emits its notice as `assets/pretendard-v1.3.9-LICENSE.txt`. Font files are bundled through the CSS asset graph, served from the application origin, and use `font-display: swap` with system fallbacks.
