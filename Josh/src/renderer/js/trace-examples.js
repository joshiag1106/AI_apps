'use strict';

/**
 * Worked programs, in teaching order.
 *
 * Each description says what to watch in the diagram, not what the code says
 * -- the code is already on screen. The working examples come first and the
 * deliberately broken ones last, because the point of a bug is lost on someone
 * who has not yet seen the thing work.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceExamples = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NL = String.fromCharCode(10);
  function code() {
    return Array.prototype.slice.call(arguments).join(NL);
  }

  const EXAMPLES = Object.freeze([
    {
      name: 'Hello, world',
      description: 'The smallest complete program. Step once and watch main '
        + 'appear on the stack, then once more to see the text reach the output.',
      source: code(
        '#include <stdio.h>',
        '',
        'int main(void) {',
        '    printf("Hello, world!\\n");',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Variables and arithmetic',
      description: 'Three variables in one frame. Watch each box fill in as its '
        + 'line runs, and notice that area holds a value only after it is '
        + 'assigned, not when it is declared.',
      source: code(
        'int main(void) {',
        '    int width = 7;',
        '    int height = 3;',
        '    int area = width * height;',
        '    printf("area = %d\\n", area);',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Making a decision',
      description: 'Only one branch of an if ever runs. Step through and watch '
        + 'the highlighted line jump straight past the else.',
      source: code(
        'int main(void) {',
        '    int score = 73;',
        '    if (score >= 50) {',
        '        printf("pass\\n");',
        '    } else {',
        '        printf("fail\\n");',
        '    }',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Counting with a loop',
      description: 'Watch i climb and total grow with it. The loop variable i '
        + 'lives only inside the loop, so it disappears from the frame when the '
        + 'loop ends.',
      source: code(
        'int main(void) {',
        '    int total = 0;',
        '    for (int i = 1; i <= 5; i++) {',
        '        total = total + i;',
        '        printf("i = %d, total = %d\\n", i, total);',
        '    }',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'An array and its elements',
      description: 'An array is one box holding several values side by side. '
        + 'Watch the loop walk along it, and notice the elements are numbered '
        + 'from zero.',
      source: code(
        'int main(void) {',
        '    int scores[4] = {10, 20, 30, 40};',
        '    int total = 0;',
        '    for (int i = 0; i < 4; i++) {',
        '        total = total + scores[i];',
        '    }',
        '    printf("total = %d\\n", total);',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Calling a function',
      description: 'Step into twice and watch a second frame appear above main, '
        + 'with its own n and result. When it returns, the whole frame vanishes '
        + 'and only the answer comes back.',
      source: code(
        'int twice(int n) {',
        '    int result = n * 2;',
        '    return result;',
        '}',
        '',
        'int main(void) {',
        '    int answer = twice(21);',
        '    printf("%d\\n", answer);',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Pointers',
      description: 'A pointer holds an address, drawn as an arrow to the box it '
        + 'points at. Watch the arrow appear, then watch writing through p '
        + 'change value itself.',
      source: code(
        'int main(void) {',
        '    int value = 42;',
        '    int *p = &value;',
        '    printf("value = %d\\n", *p);',
        '    *p = 99;',
        '    printf("value = %d\\n", value);',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Asking for memory',
      description: 'malloc gives you a block on the heap, drawn apart from the '
        + 'frames. Watch it appear, fill up, and disappear again when free is '
        + 'called.',
      source: code(
        '#include <stdlib.h>',
        '',
        'int main(void) {',
        '    int *numbers = malloc(12);',
        '    for (int i = 0; i < 3; i++) {',
        '        numbers[i] = i * 10;',
        '    }',
        '    printf("%d %d %d\\n", numbers[0], numbers[1], numbers[2]);',
        '    free(numbers);',
        '    return 0;',
        '}'
      ),
    },

    // --- deliberately broken, and each one is a lesson ---------------------
    {
      name: 'Bug: a variable that was never set',
      description: 'total is declared but never given a starting value, so the '
        + 'first addition reads whatever was in memory. Watch the box show a '
        + 'question mark right up to the moment it is read.',
      expectDiagnostic: 'uninitialised-read',
      source: code(
        'int main(void) {',
        '    int total;',
        '    for (int i = 1; i <= 3; i++) {',
        '        total = total + i;',
        '    }',
        '    printf("%d\\n", total);',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Bug: one step past the end',
      description: 'The loop uses <= where it wants <, so the last pass writes '
        + 'one element beyond the array. Watch the highlighted box and count the '
        + 'slots it actually has.',
      expectDiagnostic: 'index-out-of-range',
      source: code(
        'int main(void) {',
        '    int a[5];',
        '    for (int i = 0; i <= 5; i++) {',
        '        a[i] = i;',
        '    }',
        '    return 0;',
        '}'
      ),
    },
    {
      name: 'Bug: memory that was never given back',
      description: 'Every malloc needs a matching free. Watch the heap block sit '
        + 'there when the program ends, still allocated with nobody left to use '
        + 'it.',
      expectDiagnostic: 'memory-leak',
      source: code(
        '#include <stdlib.h>',
        '',
        'int main(void) {',
        '    int *p = malloc(40);',
        '    p[0] = 1;',
        '    printf("stored %d\\n", p[0]);',
        '    return 0;',
        '}'
      ),
    },
  ]);

  return { EXAMPLES };
});
