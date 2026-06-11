/**
 * shared/ui — cross-cutting presentational primitives, Tailwind-styled.
 *
 * These exist to keep the var()-style inline blocks from re-appearing: any
 * recurring "design token" combination (eyebrow, KPI figure, meter, accent
 * tone) lives here once and is consumed everywhere.
 */
export { Eyebrow } from './Eyebrow';
export { StatNumber } from './StatNumber';
export { Meter } from './Meter';
export { PageHeader } from './PageHeader';
export { FieldLabel, RecordTextField } from './RecordField';
export { type Tone, toneText, toneFill } from './tone';
