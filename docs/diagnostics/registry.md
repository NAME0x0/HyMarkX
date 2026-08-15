# HMX diagnostic code registry

Diagnostic codes are permanent once assigned. This registry currently records the Phase 4
expression codes and retired codes that require a lasting tombstone; a retired code remains
listed here and must never be reused.

| Code | Status | Meaning |
|---|---|---|
| `HMX1010` | **retired** | Expression-valued attributes were rejected before Phase 4. |
| `HMX1020` | active | Unterminated text interpolation. |
| `HMX1021` | active | Expression nesting exceeds the compiler limit. |
| `HMX1022` | active | Expression syntax error. |
| `HMX2040` | active | Unknown identifier in the closed frontmatter scope. |
| `HMX2041` | active | Property does not exist on a value. |
| `HMX2042` | active | Non-finite numeric result. |
| `HMX2043` | active | Object or array used in a text position. |
| `HMX2044` | active | Prohibited expression construct. |
