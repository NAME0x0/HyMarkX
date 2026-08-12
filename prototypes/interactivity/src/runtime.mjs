function mergeSets(target, source) {
  for (const value of source) target.add(value)
}

const OPERATOR_CASES = new Map([
  ['+', 'case"+":return left+right;'],
  ['-', 'case"-":return left-right;'],
  ['*', 'case"*":return left*right;'],
  ['/', 'case"/":return left/right;'],
  ['<', 'case"<":return left<right;'],
  ['<=', 'case"<=":return left<=right;'],
  ['>', 'case">":return left>right;'],
  ['>=', 'case">=":return left>=right;'],
  ['==', 'case"==":return left==right;'],
  ['!=', 'case"!=":return left!=right;'],
  ['===', 'case"===":return left===right;'],
  ['!==', 'case"!==":return left!==right;'],
])

function operatorCase(operator) {
  const source = OPERATOR_CASES.get(operator)
  if (source === undefined) throw new TypeError(`Unsupported runtime operator "${operator}"`)
  return source
}

/** Builds one feature-shaped runtime shared by every binding in the document. */
export function generateRuntime({ hasTextBindings, hasInputBindings, expressionFeatureSets }) {
  const nodeTypes = new Set()
  const unaryOperators = new Set()
  const binaryOperators = new Set()
  for (const features of expressionFeatureSets) {
    mergeSets(nodeTypes, features.nodeTypes)
    mergeSets(unaryOperators, features.unaryOperators)
    mergeSets(binaryOperators, features.binaryOperators)
  }

  const hasHandlers = expressionFeatureSets.length > 0
  const hasWrites = hasInputBindings || nodeTypes.has('a')
  const needsQuery = hasTextBindings || hasInputBindings || hasHandlers
  const lines = ['const __hmx=c=>{', 'const state=c.state;']

  if (needsQuery) {
    lines.push("const query=(kind,id)=>document.querySelector('[data-hmx-'+kind+'=\"'+id+'\"]');")
  }
  if (hasTextBindings) {
    lines.push(
      "const texts=Object.fromEntries(Object.entries(c.texts).map(([name,ids])=>[name,ids.map(id=>query('t',id))]));",
    )
  }
  if (hasInputBindings) {
    lines.push(
      "const inputs=Object.fromEntries(Object.entries(c.inputs).map(([name,ids])=>[name,ids.map(id=>query('i',id))]));",
    )
  }
  if (hasWrites) {
    lines.push('const write=(name,value)=>{', 'state[name]=value;')
    if (hasTextBindings) {
      lines.push(
        'if(texts[name])for(const element of texts[name])element.textContent=String(value);',
      )
    }
    if (hasInputBindings) {
      lines.push(
        'if(inputs[name])for(const element of inputs[name])if(element.value!==String(value))element.value=String(value);',
      )
    }
    lines.push('return value;', '};')
  }

  if (hasHandlers) {
    lines.push('const run=node=>{', 'switch(node[0]){')
    if (nodeTypes.has('l')) lines.push("case'l':return node[1];")
    if (nodeTypes.has('i')) lines.push("case'i':return state[node[1]];")
    if (nodeTypes.has('a')) lines.push("case'a':return write(node[1],run(node[2]));")
    if (nodeTypes.has('u')) {
      lines.push("case'u':{const value=run(node[2]);switch(node[1]){")
      if (unaryOperators.has('!')) lines.push("case'!':return !value;")
      if (unaryOperators.has('-')) lines.push("case'-':return -value;")
      if (unaryOperators.has('+')) lines.push("case'+':return +value;")
      lines.push('}}')
    }
    if (nodeTypes.has('b')) {
      lines.push("case'b':{")
      if (binaryOperators.has('&&')) {
        lines.push("if(node[1]==='&&')return run(node[2])&&run(node[3]);")
      }
      if (binaryOperators.has('||')) {
        lines.push("if(node[1]==='||')return run(node[2])||run(node[3]);")
      }
      const eagerOperators = [...binaryOperators].filter(
        (operator) => operator !== '&&' && operator !== '||',
      )
      if (eagerOperators.length > 0) {
        lines.push('const left=run(node[2]),right=run(node[3]);', 'switch(node[1]){')
        for (const operator of eagerOperators) lines.push(operatorCase(operator))
        lines.push('}')
      }
      lines.push('}')
    }
    lines.push('}', "throw new TypeError('Unsupported expression instruction');", '};')
    lines.push(
      "for(const [id,expression] of c.handlers)query('e',id).addEventListener('click',()=>run(expression));",
    )
  }

  if (hasInputBindings) {
    lines.push(
      "for(const [name,elements] of Object.entries(inputs))for(const element of elements)element.addEventListener('input',()=>write(name,element.value));",
    )
  }
  lines.push('};', '')
  return lines.join('\n')
}

/** Serializes binding data so text cannot terminate the containing script element. */
export function generateBindings(config) {
  const data = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `__hmx(${data});\n`
}
