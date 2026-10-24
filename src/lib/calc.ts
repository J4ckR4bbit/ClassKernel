/**
 * Work out a typed sum for the mark calculator: + − × ÷ (or * / x), brackets,
 * and a decimal comma or point ("3+2+1,5", "34/50*100"). Spaces are ignored,
 * so "1 250" is 1250. Null while the sum is unfinished or isn't one, and for a
 * division by zero. A small parser, never eval.
 */
export function calculate(text: string): number | null {
  const tokens = tokenise(text);
  if (!tokens || tokens.length === 0) return null;
  let i = 0;
  const peek = () => tokens[i];

  // sum = term (("+" | "-") term)*
  const sum = (): number | null => {
    let value = term();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = tokens[i++];
      const next = term();
      if (next === null) return null;
      value = op === "+" ? value + next : value - next;
    }
    return value;
  };
  // term = factor (("*" | "/") factor)*
  const term = (): number | null => {
    let value = factor();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = tokens[i++];
      const next = factor();
      if (next === null) return null;
      value = op === "*" ? value * next : value / next;
    }
    return value;
  };
  // factor = ("+" | "-") factor | number | "(" sum ")"
  const factor = (): number | null => {
    const t = tokens[i++];
    if (t === "-" || t === "+") {
      const value = factor();
      return value === null ? null : t === "-" ? -value : value;
    }
    if (t === "(") {
      const value = sum();
      return tokens[i++] === ")" ? value : null;
    }
    return typeof t === "number" ? t : null;
  };

  const value = sum();
  if (value === null || i !== tokens.length || !Number.isFinite(value)) return null;
  // Rounded to clear binary noise: 0,1 + 0,2 is 0,3.
  return Math.round(value * 1e9) / 1e9;
}

type Token = number | "+" | "-" | "*" | "/" | "(" | ")";

const OPERATORS: Record<string, Token> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  x: "*",
  X: "*",
  "/": "/",
  "÷": "/",
  "(": "(",
  ")": ")",
};

function tokenise(text: string): Token[] | null {
  const s = text.replace(/\s/g, "");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const number = /^(\d+([.,]\d*)?|[.,]\d+)/.exec(s.slice(i));
    if (number) {
      tokens.push(Number(number[0].replace(",", ".")));
      i += number[0].length;
      continue;
    }
    const op = OPERATORS[s[i]];
    if (!op) return null;
    tokens.push(op);
    i++;
  }
  return tokens;
}
