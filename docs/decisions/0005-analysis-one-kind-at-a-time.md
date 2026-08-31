# 5. The analysis chart shows one kind at a time

Date: 2026-08-31 · Status: accepted

## Context

The trend view was two bars per bucket — money in and money out, all domains
added together. It could not answer "how much on transport this year",
which is most of why the ledger exists. Replacing it meant deciding what a
single chart plots.

## Decision

One line (or one stacked bar) per domain, and the whole chart is scoped to a
single kind, chosen with a control: money out, money in, or set aside.
Ranges are two arbitrary dates rather than a fixed set of windows.

## Reasoning

Domains and kinds cannot share a vertical axis. A ৳15,000 monthly allowance
and a ৳300 bazar trip on the same scale flattens every expense line onto the
baseline — the allowance is the only thing visible, and the chart answers
nothing. Scoping to one kind means the axis is always sized to the values
being compared.

It also makes the colours mean one thing. With a kind filter, a colour is a
domain; without it, a colour would have to encode domain and kind together,
which no legend can carry.

Fixed windows (3 months, 6 months, a year) were the first attempt and were
wrong for the same reason any fixed set is wrong: the question is usually
"this semester" or "since I moved", which no preset spells. Two date inputs
cover every window including the presets, so the presets that remain are
shortcuts, not the only options.

Bucket size is derived from the span rather than chosen freely. Daily
buckets over three years is roughly eleven hundred marks in a phone-width
chart; the grain control only offers sizes that stay readable, and a grain
the span cannot carry falls back rather than rendering a picket fence.

## Consequences

Comparing spending against income needs two glances rather than one. That is
the right trade: the previous single glance was unreadable. The month view on
the "Where it went" tab still shows all three kinds side by side, which is
where that comparison belongs.
