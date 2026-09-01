import { ReferenceLine } from "recharts";

/**
 * Shared across all three trend charts (exposure/rank/voice) - one GEO
 *施策 (marketing_actions - see lib/marketing-actions.ts) plotted as a
 * vertical marker on whichever chart is showing, so a rank/exposure
 * shift can be eyeballed against what was actually done that day.
 * `date` must already be formatted the same way as the chart's own
 * `date` field (dashboard/page.tsx's "M/d") - Recharts' X axis here is
 * categorical, so a ReferenceLine's `x` only lands correctly when it
 * matches one of the axis's actual category values exactly.
 */
export type ActionMarker = { date: string; category: string; title: string };

/**
 * Deliberately a plain function returning an array of elements, NOT a
 * wrapping component - Recharts inspects a chart's immediate `children`
 * to find its own sub-components (Line, XAxis, ReferenceLine, ...) and
 * does not render arbitrary custom components first to discover more of
 * them nested inside. A `<ActionMarkers markers={...} />` child would
 * silently be invisible to Recharts; `{renderActionMarkers(markers)}`
 * spread directly inside the chart is a flat array of real
 * `<ReferenceLine>` elements, which Recharts does handle.
 */
export function renderActionMarkers(markers: ActionMarker[]) {
  return markers.map((m, i) => (
    <ReferenceLine
      key={`${m.date}-${i}`}
      x={m.date}
      // Same amber as the ⚠️ check-error badge, deliberately not the
      // brand's own indigo (already used for real trend lines/the
      // "look here" alert-jump highlight) or a data-series color - this
      // needs to read as "something happened" annotation, distinct
      // from both.
      stroke="#f59e0b"
      strokeDasharray="4 3"
      strokeWidth={1.5}
      ifOverflow="extendDomain"
      label={(props: { viewBox?: { x?: number; y?: number } }) => (
        <g transform={`translate(${props.viewBox?.x ?? 0}, ${props.viewBox?.y ?? 0})`}>
          {/* Native SVG tooltip (a <title> element is never HTML-entity-
              clipped by an ancestor's overflow the way the app's Radix
              Tooltip content can be - see components/ui/tooltip.tsx's
              own Portal fix - and Recharts' custom `label` render sits
              deep inside an SVG tree a Radix trigger can't attach to
              cleanly), consistent with how citations already do this
              in app/dashboard/page.tsx. */}
          <title>{`[${m.category}] ${m.title}`}</title>
          <circle r={5} cy={-2} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} className="cursor-help" />
        </g>
      )}
    />
  ));
}
