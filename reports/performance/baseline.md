# Web performance baseline

Generated: 2026-08-10T15:25:28.230Z

Profile: cold cache per sample, mobile 390×844, 4× CPU slowdown, 1.6 Mbps down / 750 Kbps up, 150 ms latency. Values are median of 3 independent runs. Targets are advisory.

| Page | LCP (< 2500 ms) | CLS (< 0.1) | INP (< 200 ms) |
|---|---:|---:|---:|
| client-home | 2420 ms ✅ | 0 ✅ | 48 ms ✅ |
| client-shop-list | 2428 ms ✅ | 0 ✅ | 40 ms ✅ |
| client-product-detail | 2428 ms ✅ | 0 ✅ | 40 ms ✅ |
| bento-landing | 4740 ms ⚠️ | 0 ✅ | 72 ms ✅ |

Raw samples and machine-readable pass flags are in `baseline.json`. An unavailable INP means Chrome did not expose a qualifying Event Timing entry; it is not counted as a pass.
