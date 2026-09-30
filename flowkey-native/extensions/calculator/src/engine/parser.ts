/**
 * Expression evaluator — a faithful port of the shell's ExpressionParser.cs.
 * Recursive descent over a hand-written token stream: additive → multiplicative
 * → unary → power → postfix (%) → primary, with scale suffixes (k/M/b),
 * constants, implicit multiplication and a math/trig function set.
 */

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  τ: Math.PI * 2,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
};

type TokenType = 'number' | 'identifier' | 'operator' | 'leftParen' | 'rightParen' | 'comma';

interface Token {
  type: TokenType;
  text: string;
  numberValue: number;
}

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const current = text[index];
    if (/\s/.test(current)) {
      index++;
      continue;
    }
    if (
      /[0-9]/.test(current) ||
      (current === '.' && index + 1 < text.length && /[0-9]/.test(text[index + 1]))
    ) {
      const start = index;
      while (index < text.length && (/[0-9]/.test(text[index]) || text[index] === '.')) {
        index++;
      }
      const literal = text.slice(start, index);
      const number = Number(literal);
      if (Number.isNaN(number)) {
        return null;
      }
      tokens.push({ type: 'number', text: literal, numberValue: number });
      continue;
    }
    if (/[a-zA-Z]/.test(current) || current === 'τ') {
      if (
        (current === 'x' || current === 'X') &&
        tokens.length > 0 &&
        (tokens[tokens.length - 1].type === 'number' ||
          tokens[tokens.length - 1].type === 'rightParen')
      ) {
        tokens.push({ type: 'operator', text: '*', numberValue: 0 });
        index++;
        continue;
      }
      const start = index;
      while (index < text.length && (/[a-zA-Z0-9]/.test(text[index]) || text[index] === 'τ')) {
        index++;
      }
      tokens.push({ type: 'identifier', text: text.slice(start, index), numberValue: 0 });
      continue;
    }
    switch (current) {
      case '(':
        tokens.push({ type: 'leftParen', text: '(', numberValue: 0 });
        break;
      case ')':
        tokens.push({ type: 'rightParen', text: ')', numberValue: 0 });
        break;
      case ',':
        tokens.push({ type: 'comma', text: ',', numberValue: 0 });
        break;
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
      case '%':
        tokens.push({ type: 'operator', text: current, numberValue: 0 });
        break;
      case '×':
        tokens.push({ type: 'operator', text: '*', numberValue: 0 });
        break;
      case '÷':
        tokens.push({ type: 'operator', text: '/', numberValue: 0 });
        break;
      default:
        return null;
    }
    index++;
  }
  return tokens;
}

class Cursor {
  constructor(
    private readonly tokens: Token[],
    public position = 0,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.position];
  }
}

function parseAdditive(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  if (!parseMultiplicative(tokens, cursor, out)) {
    return false;
  }
  let left = out.value;
  while (cursor.position < tokens.length) {
    const next = tokens[cursor.position];
    if (next.type !== 'operator' || (next.text !== '+' && next.text !== '-')) {
      break;
    }
    cursor.position++;
    if (!parseMultiplicative(tokens, cursor, out)) {
      return false;
    }
    left = next.text === '+' ? left + out.value : left - out.value;
  }
  out.value = left;
  return true;
}

function parseMultiplicative(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  if (!parseUnary(tokens, cursor, out)) {
    return false;
  }
  let left = out.value;
  while (cursor.position < tokens.length) {
    const next = tokens[cursor.position];
    if (next.type === 'operator' && (next.text === '*' || next.text === '/')) {
      cursor.position++;
      if (!parseUnary(tokens, cursor, out)) {
        return false;
      }
      left = next.text === '*' ? left * out.value : left / out.value;
    } else if (next.type === 'leftParen') {
      // juxtaposition: 2(3) multiplies
      if (!parseUnary(tokens, cursor, out)) {
        return false;
      }
      left *= out.value;
    } else {
      break;
    }
  }
  out.value = left;
  return true;
}

function parseUnary(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  const next = cursor.peek();
  if (next && next.type === 'operator' && (next.text === '-' || next.text === '+')) {
    cursor.position++;
    if (!parseUnary(tokens, cursor, out)) {
      return false;
    }
    if (next.text === '-') {
      out.value = -out.value;
    }
    return true;
  }
  return parsePower(tokens, cursor, out);
}

function parsePower(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  if (!parsePostfix(tokens, cursor, out)) {
    return false;
  }
  const base = out.value;
  const next = cursor.peek();
  if (next && next.type === 'operator' && next.text === '^') {
    cursor.position++;
    if (!parseUnary(tokens, cursor, out)) {
      return false;
    }
    out.value = Math.pow(base, out.value);
    return true;
  }
  out.value = base;
  return true;
}

function parsePostfix(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  if (!parsePrimary(tokens, cursor, out)) {
    return false;
  }
  while (cursor.peek() && cursor.peek()!.type === 'operator' && cursor.peek()!.text === '%') {
    cursor.position++;
    out.value /= 100;
  }
  return true;
}

function parsePrimary(tokens: Token[], cursor: Cursor, out: { value: number }): boolean {
  const token = cursor.peek();
  if (!token) {
    return false;
  }
  if (token.type === 'number') {
    cursor.position++;
    out.value = applyScaleSuffix(tokens, cursor, token.numberValue);
    return true;
  }
  if (token.type === 'identifier') {
    const lower = token.text.toLowerCase();
    if (lower in CONSTANTS) {
      cursor.position++;
      out.value = CONSTANTS[lower];
      return true;
    }
    const next = tokens[cursor.position + 1];
    if (next && next.type === 'leftParen') {
      cursor.position += 2;
      const args: number[] = [];
      const after = cursor.peek();
      if (after && after.type === 'rightParen') {
        cursor.position++;
        return tryCall(lower, args, out);
      }
      while (true) {
        if (!parseAdditive(tokens, cursor, out)) {
          return false;
        }
        args.push(out.value);
        const separator = cursor.peek();
        if (separator && separator.type === 'comma') {
          cursor.position++;
          continue;
        }
        const closing = cursor.peek();
        if (closing && closing.type === 'rightParen') {
          cursor.position++;
          return tryCall(lower, args, out);
        }
        return false;
      }
    }
    return false;
  }
  if (token.type === 'leftParen') {
    cursor.position++;
    if (!parseAdditive(tokens, cursor, out)) {
      return false;
    }
    const closing = cursor.peek();
    if (!closing || closing.type !== 'rightParen') {
      return false;
    }
    cursor.position++;
    out.value = applyScaleSuffix(tokens, cursor, out.value);
    return true;
  }
  return false;
}

function applyScaleSuffix(tokens: Token[], cursor: Cursor, number: number): number {
  const next = cursor.peek();
  if (next && next.type === 'identifier') {
    const scale =
      next.text === 'k' || next.text === 'K'
        ? 1e3
        : next.text === 'M'
          ? 1e6
          : next.text === 'b' || next.text === 'B'
            ? 1e9
            : 0;
    if (scale > 0) {
      cursor.position++;
      return number * scale;
    }
  }
  return number;
}

function tryCall(name: string, args: number[], out: { value: number }): boolean {
  const one = args.length === 1 ? args[0] : NaN;
  switch (name) {
    case 'sqrt':
      if (args.length === 1) {
        out.value = Math.sqrt(one);
        return true;
      }
      break;
    case 'cbrt':
      if (args.length === 1) {
        out.value = Math.cbrt(one);
        return true;
      }
      break;
    case 'abs':
      if (args.length === 1) {
        out.value = Math.abs(one);
        return true;
      }
      break;
    case 'round':
      if (args.length === 1) {
        out.value = roundAwayFromZero(one, 0);
        return true;
      }
      if (args.length === 2) {
        out.value = roundAwayFromZero(args[0], Math.min(Math.max(Math.trunc(args[1]), 0), 15));
        return true;
      }
      break;
    case 'floor':
      if (args.length === 1) {
        out.value = Math.floor(one);
        return true;
      }
      break;
    case 'ceil':
    case 'ceiling':
      if (args.length === 1) {
        out.value = Math.ceil(one);
        return true;
      }
      break;
    case 'ln':
      if (args.length === 1) {
        out.value = Math.log(one);
        return true;
      }
      break;
    case 'log':
      if (args.length === 1) {
        out.value = Math.log10(one);
        return true;
      }
      break;
    case 'log2':
      if (args.length === 1) {
        out.value = Math.log2(one);
        return true;
      }
      break;
    case 'exp':
      if (args.length === 1) {
        out.value = Math.exp(one);
        return true;
      }
      break;
    case 'sign':
      if (args.length === 1) {
        out.value = Math.sign(one);
        return true;
      }
      break;
    case 'min':
      if (args.length === 2) {
        out.value = Math.min(args[0], args[1]);
        return true;
      }
      break;
    case 'max':
      if (args.length === 2) {
        out.value = Math.max(args[0], args[1]);
        return true;
      }
      break;
  }
  return tryTrig(name, args, out);
}

function roundAwayFromZero(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return (Math.sign(value) * Math.round(Math.abs(value) * factor - Number.EPSILON)) / factor + 0;
}

function tryTrig(name: string, args: number[], out: { value: number }): boolean {
  if (args.length !== 1) {
    return false;
  }
  const x = args[0];
  let value = NaN;
  switch (name) {
    case 'sin':
      value = Math.sin(x);
      break;
    case 'cos':
      value = Math.cos(x);
      break;
    case 'tan':
      value = Math.tan(x);
      break;
    case 'asin':
      value = Math.asin(x);
      break;
    case 'acos':
      value = Math.acos(x);
      break;
    case 'atan':
      value = Math.atan(x);
      break;
    case 'sinh':
      value = Math.sinh(x);
      break;
    case 'cosh':
      value = Math.cosh(x);
      break;
    case 'tanh':
      value = Math.tanh(x);
      break;
    case 'asinh':
      value = Math.asinh(x);
      break;
    case 'acosh':
      value = Math.acosh(x);
      break;
    case 'atanh':
      value = Math.atanh(x);
      break;
    case 'cot':
      value = 1 / Math.tan(x);
      break;
    case 'sec':
      value = 1 / Math.cos(x);
      break;
    case 'csc':
      value = 1 / Math.sin(x);
      break;
    case 'coth':
      value = 1 / Math.tanh(x);
      break;
    case 'sech':
      value = 1 / Math.cosh(x);
      break;
    case 'csch':
      value = 1 / Math.sinh(x);
      break;
    case 'acot':
      value = Math.atan(1 / x);
      break;
    case 'asec':
      value = Math.acos(1 / x);
      break;
    case 'acsc':
      value = Math.asin(1 / x);
      break;
    default:
      return false;
  }
  if (Number.isNaN(value) && name !== 'acot' && name !== 'asec' && name !== 'acsc') {
    return false;
  }
  out.value = value;
  return true;
}

export function tryEvaluateExpression(expression: string): number | null {
  if (!expression.trim()) {
    return null;
  }
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const cursor = new Cursor(tokens);
  const out = { value: 0 };
  if (!parseAdditive(tokens, cursor, out) || cursor.position !== tokens.length) {
    return null;
  }
  if (Number.isNaN(out.value) || !Number.isFinite(out.value)) {
    return null;
  }
  return out.value;
}
