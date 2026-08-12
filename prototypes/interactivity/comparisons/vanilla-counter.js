let count = 0
const output = document.getElementById('count')

document.getElementById('increment').addEventListener('click', () => {
  count += 1
  output.textContent = String(count)
})
