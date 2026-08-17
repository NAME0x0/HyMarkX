const output = document.getElementById('signups')
let signups = Number(output.textContent)
document.getElementById('add').addEventListener('click', () => {
  signups += 1
  output.textContent = String(signups)
})
