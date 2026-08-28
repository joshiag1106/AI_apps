/**
 * A deliberately partial Itanium ABI demangler.
 *
 * Covers length-prefixed nested names (`_ZN...E`), builtin type codes, the `P`
 * and `RK` qualifiers, template arguments (`I...E`), and the common `St`/`Ss`/
 * `Sa` abbreviations. Back-references (`S_`, `S0_`, ...) are the genuinely
 * hard part of the ABI and are not supported.
 *
 * Any unsupported construct or parse failure returns the input unchanged.
 * That is the whole safety story: a mangled name is exactly what the user
 * sees today, so the floor is "no worse than now". A partially demangled or
 * wrong name would be worse than none.
 *
 * This exists rather than an IPC channel to `c++filt` because shelling out
 * would widen the trust boundary for a cosmetic gain.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Demangle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BUILTINS = Object.freeze({
    v: 'void', b: 'bool', c: 'char', a: 'signed char', h: 'unsigned char',
    s: 'short', t: 'unsigned short', i: 'int', j: 'unsigned int',
    l: 'long', m: 'unsigned long', x: 'long long', y: 'unsigned long long',
    f: 'float', d: 'double', e: 'long double', w: 'wchar_t',
  });

  const ABBREVIATIONS = Object.freeze({
    St: 'std',
    Ss: 'std::string',
    Sa: 'std::allocator',
    Sb: 'std::basic_string',
  });

  /** Thrown internally the moment anything is not understood. */
  function Unsupported() {}

  function parser(input) {
    return { s: input, i: 0 };
  }

  function peek(p) {
    return p.i < p.s.length ? p.s[p.i] : '';
  }

  function take(p) {
    if (p.i >= p.s.length) throw new Unsupported();
    return p.s[p.i++];
  }

  function expect(p, ch) {
    if (take(p) !== ch) throw new Unsupported();
  }

  /** `<length><identifier>` - the ABI's only way to write a name. */
  function readIdentifier(p) {
    let digits = '';
    while (peek(p) >= '0' && peek(p) <= '9') digits += take(p);
    if (!digits) throw new Unsupported();
    const length = Number(digits);
    if (!Number.isSafeInteger(length) || length <= 0) throw new Unsupported();
    if (p.i + length > p.s.length) throw new Unsupported();
    const name = p.s.slice(p.i, p.i + length);
    p.i += length;
    return name;
  }

  /**
   * A type: qualifiers, then a builtin code, an abbreviation, or a name that
   * may itself carry template arguments.
   */
  function readType(p) {
    const ch = peek(p);

    if (ch === 'P') { take(p); return readType(p) + '*'; }
    if (ch === 'R') { take(p); return readType(p) + '&'; }
    if (ch === 'K') { take(p); return readType(p) + ' const'; }

    if (ch === 'S') {
      take(p);
      const next = take(p);
      const abbreviation = ABBREVIATIONS['S' + next];
      // `S_`, `S0_` and friends are back-references. Not supported.
      if (!abbreviation) throw new Unsupported();
      return abbreviation;
    }

    if (ch === 'N') return readNestedName(p);

    if (BUILTINS[ch]) { take(p); return BUILTINS[ch]; }

    if (ch >= '1' && ch <= '9') {
      let name = readIdentifier(p);
      if (peek(p) === 'I') name += readTemplateArguments(p);
      return name;
    }

    throw new Unsupported();
  }

  /** `I <type>+ E` */
  function readTemplateArguments(p) {
    expect(p, 'I');
    const args = [];
    while (peek(p) && peek(p) !== 'E') args.push(readType(p));
    expect(p, 'E');
    if (!args.length) throw new Unsupported();
    return '<' + args.join(', ') + '>';
  }

  /** `N <component>+ E`, where a component may carry template arguments. */
  function readNestedName(p) {
    expect(p, 'N');
    const parts = [];
    while (peek(p) && peek(p) !== 'E') {
      // Qualifiers may precede the components of a nested name.
      if (peek(p) === 'K' || peek(p) === 'V') { take(p); continue; }
      if (peek(p) === 'S') {
        take(p);
        const abbreviation = ABBREVIATIONS['S' + take(p)];
        if (!abbreviation) throw new Unsupported();
        parts.push(abbreviation);
        continue;
      }
      let part = readIdentifier(p);
      if (peek(p) === 'I') part += readTemplateArguments(p);
      parts.push(part);
    }
    expect(p, 'E');
    if (!parts.length) throw new Unsupported();
    return parts.join('::');
  }

  /** The parameter list trailing a function name. `v` alone means none. */
  function readParameters(p) {
    if (p.i >= p.s.length) throw new Unsupported();
    const params = [];
    while (p.i < p.s.length) params.push(readType(p));
    if (params.length === 1 && params[0] === 'void') return '()';
    return '(' + params.join(', ') + ')';
  }

  /**
   * Demangle an Itanium-ABI name, or return it unchanged.
   *
   * Never throws, and never returns a partial result: the caller can splice
   * the return value into user-visible text unconditionally.
   */
  function demangle(name) {
    if (typeof name !== 'string') return name;
    if (!name.startsWith('_Z')) return name;

    try {
      const p = parser(name.slice(2));
      const head = peek(p) === 'N' ? readNestedName(p) : (function () {
        let n = readIdentifier(p);
        if (peek(p) === 'I') n += readTemplateArguments(p);
        return n;
      })();
      const params = readParameters(p);
      if (p.i !== p.s.length) throw new Unsupported();
      return head + params;
    } catch (error) {
      return name;
    }
  }

  return { demangle };
});
