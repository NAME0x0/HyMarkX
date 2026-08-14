<style scoped>
.dashboard > .hmx-card:hover,
.hmx-note::before {
  outline-color: var(--hmx-color-info);
}
@media (min-width: 48rem) {
  .dashboard { align-items: start; }
}
@supports (text-wrap: balance) {
  .hmx-card-title { text-wrap: balance; }
}
@keyframes reveal {
  from { opacity: 0; }
  50% { opacity: 0.5; }
  to { opacity: 1; }
}
:global(body) .dashboard { margin-inline: auto; }
</style>

# Quarterly dashboard

:::note[Heads up]{type=warning}
Figures are preliminary.
:::

::::grid{columns=2 gap=6 .dashboard}
:::card[Revenue]
Card detail.
:::

:::metric[ARR]
$1.2M
:::
::::

Status: :badge[healthy]{kind=success}.
