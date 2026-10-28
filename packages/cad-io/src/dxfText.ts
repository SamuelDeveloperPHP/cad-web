/**
 * Textos do DXF: códigos especiais do TEXT (%%d, %%p, %%c), escapes Unicode (\U+XXXX) e a formatação em linha
 * do MTEXT (\P, \f, \C, \H, \S, chaves...), reduzidos a texto simples (várias linhas separadas por \n).
 */

const SPECIAL_CODES: Readonly<Record<string, string>> = { d: "°", p: "±", c: "Ø", "%": "%" };

// Escapes de caractere comuns aos dois tipos de texto.
function decodeEscapes(text: string): string {
  return text
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/%%([dDpPcC%])/g, (_match, code: string) => SPECIAL_CODES[code.toLowerCase()] ?? "")
    // Sublinhado e sobrelinha (%%u, %%o) não têm equivalente no texto simples.
    .replace(/%%[uUoO]/g, "");
}

export function decodeDxfText(text: string): string {
  return decodeEscapes(text);
}

/**
 * Reduz o conteúdo de um MTEXT a texto simples. Quebras (\P) viram \n; empilhados (\S a/b;) viram "a/b";
 * comandos de fonte, cor, altura, largura, inclinação e rastreamento são descartados; chaves só agrupam.
 */
export function stripMtextFormatting(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (char === "{" || char === "}") {
      index += 1;
      continue;
    }

    if (char !== "\\") {
      result += char;
      index += 1;
      continue;
    }

    const code = source[index + 1];

    if (code === undefined) {
      break;
    }

    // Escapes literais.
    if (code === "\\" || code === "{" || code === "}") {
      result += code;
      index += 2;
      continue;
    }

    if (code === "P" || code === "p") {
      result += "\n";
      index += 2;
      continue;
    }

    if (code === "~") {
      result += " ";
      index += 2;
      continue;
    }

    // Alternadores sem argumento (sublinhado, sobrelinha, tachado).
    if ("LlOoKk".includes(code)) {
      index += 2;
      continue;
    }

    if (code === "U" && source[index + 2] === "+") {
      const hex = source.slice(index + 3, index + 7);

      if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
        result += String.fromCodePoint(parseInt(hex, 16));
        index += 7;
        continue;
      }
    }

    if (code === "S") {
      const end = source.indexOf(";", index);
      const stack = source.slice(index + 2, end === -1 ? source.length : end);
      result += stack.replace(/[\^#]/g, "/");
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    // Comandos com argumento até o ponto e vírgula: fonte, cor, altura, largura, inclinação, rastreamento, alinhamento.
    if ("fFCcHhWwQqTtAa".includes(code)) {
      const end = source.indexOf(";", index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    // Escape desconhecido: mantém o caractere seguinte.
    result += code;
    index += 2;
  }

  return decodeEscapes(result);
}
