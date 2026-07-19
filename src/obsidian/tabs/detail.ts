import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
export interface DetailState { metricId: string | null; range: RangeKey; }
export function renderDetail(_el: HTMLElement, _cache: HealthCache, _state: DetailState, _onState: (s: DetailState) => void): void {}
