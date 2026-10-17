import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

function report(metric: Metric): void {
  // Console in dev; in production this is where a real endpoint would go
  if (import.meta.env.DEV) {
    console.info(`[vitals] ${metric.name}=${metric.value.toFixed(2)} (${metric.rating})`);
  }
}

export function initWebVitals(): void {
  onLCP(report);
  onCLS(report);
  onINP(report);
}
