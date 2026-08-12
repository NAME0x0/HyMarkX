const { createElement, useState } = React

function Counter() {
  const [count, setCount] = useState(0)
  return createElement(
    React.Fragment,
    null,
    createElement('h1', null, 'Counter'),
    createElement('button', { onClick: () => setCount(count + 1) }, 'Increment'),
    createElement('p', null, 'Count is ', count, '.'),
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(createElement(Counter))
