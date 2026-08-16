# Interactivity

HMX compiles local state and event handlers into targeted DOM updates. Initial values are
already present in the HTML, so the document remains correct when JavaScript is disabled.
Static documents still emit an empty `js` result.

## A page counter

Declare state directly in the page root, assign it from an allowlisted event, and read it
with the normal expression syntax:

```hmx
::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Count is {{ count }}.
```

State values are strings, numbers, booleans, or `null`. A handler may read and assign only
state declared in the same page or authored-component expansion. Assignment in an ordinary
interpolation or attribute expression is an error.

In document mode, reactive attributes declared with a component schema's `url` type keep the
safe `http`, `https`, `mailto`, and relative-reference scheme boundary when state changes.

The allowlisted attributes are `on-click`, `on-input`, `on-change`, `on-submit`, `on-focus`,
`on-blur`, and `on-keydown`. HMX rejects every other `on-` attribute. Handlers cannot reach
`window`, `document`, network APIs, storage, timers, or other host globals.

## Local state in authored components

Put the declaration directly in the component root. For example, create
`components/Counter.hmx`:

```hmx
::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Count is {{ count }}.
```

Use it more than once from a page:

```hmx
# Independent counters

:::Counter
:::

:::Counter
:::
```

Each expansion owns a separate `count`. Clicking one counter does not change the other.
State is not ambient: a nested component receives only its declared props. A parent can pass
state with an expression such as `:::Child{label={label}}`; the compiler connects that parent
state directly to the child's marked view positions without creating child state.

## Text input

On a native `input` directive, `on-input` binds the element value to the single state name
assigned by the handler. HMX first coerces the text to that state's declared scalar type,
then runs the handler. Writing the same name on both sides expresses a direct binding:

```hmx
::state{name=Ada}

::input{on-input="name = name"}

Hello, {{ name }}.
```

String input is copied directly. Numeric input uses finite-number coercion and ignores text
that is not a finite number. Boolean input accepts `true` as true and other text as false;
null input changes only for the exact text `null`.

## Compiler and CLI output

`compile()` returns `html`, `css`, and `js`. Set `inlineJs: true` to append the one generated
script to the HTML; `inlineCss` works the same way for styles. `hmx build --out -` inlines both
artifacts. A directory build writes `.html`, `.css`, and `.js` files with matching stems.

The generated HTML marks only state-dependent text/attribute positions and event targets.
When state changes, the runtime evaluates the compiled instruction and touches only the
dependency-table entries for that state; it does not re-render or diff a tree.
