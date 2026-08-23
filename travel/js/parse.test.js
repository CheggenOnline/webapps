/* Deliberate malformed-JSON fixtures for the tolerant parser (spec §5).
   Runs in the browser via ../test.html, and under node. */

import { parseTolerant, shapeAnalysis, stripFences } from './parse.js';

const CASES = [
  {
    name: 'clean object',
    input: '{"events":[{"title":"Hente barna","start":"2026-08-23T19:15"}],"questions":[]}',
    check: (r) => r.ok && !r.repaired && r.data.events[0].start === '2026-08-23T19:15'
  },
  {
    name: 'fenced in ```json',
    input: '```json\n{"events":[],"people":["Hedda"]}\n```',
    check: (r) => r.ok && r.data.people[0] === 'Hedda'
  },
  {
    name: 'unterminated fence',
    input: '```json\n{"events":[],"people":["Hedda"]}',
    check: (r) => r.ok && r.data.people[0] === 'Hedda'
  },
  {
    name: 'prose before the object',
    input: 'Here is the JSON you asked for:\n{"events":[],"questions":["Hvor skal turen?"]}',
    check: (r) => r.ok && r.data.questions[0] === 'Hvor skal turen?'
  },
  {
    name: 'missing final closing brace',
    input: '{"events":[],"questions":["Hvor skal dere?"]',
    check: (r) => r.ok && r.repaired && r.data.questions.length === 1
  },
  {
    name: 'truncated mid-string in a value',
    input: '{"events":[{"title":"Hente barna hos farmor og farfar',
    check: (r) => r.ok && r.data.events[0].title === 'Hente barna hos farmor og farfar'
  },
  {
    name: 'truncated mid-key — drops the half member, keeps the rest',
    input: '{"events":[],"lists":[{"title":"Til meg","entries":[{"text":"Sokker"}]}],"vau',
    check: (r) => r.ok && r.data.lists[0].entries[0].text === 'Sokker' && r.data.vau === undefined
  },
  {
    name: 'truncated mid-number',
    input: '{"detectedGroups":[{"groupName":"airplane","confidence":0.',
    check: (r) => r.ok && r.data.detectedGroups[0].groupName === 'airplane'
  },
  {
    name: 'trailing comma in an array',
    input: '{"people":["Nils Georg","Kristoffer",]}',
    check: (r) => r.ok && r.data.people.length === 2
  },
  {
    name: 'truncated after a comma',
    input: '{"people":["Nils Georg","Kristoffer",',
    check: (r) => r.ok && r.data.people.length === 2
  },
  {
    name: 'trailing comma before a closing brace',
    input: '{"events":[{"title":"Avreise","hard":true,},],}',
    check: (r) => r.ok && r.data.events[0].hard === true
  },
  {
    name: 'deep truncation keeps complete siblings',
    input: '{"lists":[{"title":"Til meg","entries":[{"text":"Sokker"},{"text":"Boksere"},{"text":"Toalett',
    check: (r) => r.ok && r.data.lists[0].entries.length >= 2 && r.data.lists[0].entries[0].text === 'Sokker'
  },
  {
    name: 'escaped quote inside a truncated string',
    input: '{"vault":[{"label":"Wifi","value":"pass\\"ord',
    check: (r) => r.ok && r.data.vault[0].value === 'pass"ord'
  },
  {
    name: 'a whole capture is never lost to one brace',
    input: '{"events":[{"title":"Hente barna","start":"2026-08-23T19:15","hard":true}],'
         + '"lists":[{"kind":"packing","title":"Pakkeliste","groupHint":"Til meg",'
         + '"entries":[{"text":"Sokker"},{"text":"Boksere"}]}],"people":["Hedda"]',
    check: (r) => r.ok && r.data.events.length === 1 && r.data.lists[0].entries.length === 2 && r.data.people[0] === 'Hedda'
  },
  {
    name: 'not JSON at all fails cleanly',
    input: 'I could not do that.',
    check: (r) => !r.ok && !!r.error
  },
  {
    name: 'empty response fails cleanly',
    input: '   ',
    check: (r) => !r.ok
  },
  {
    name: 'shapeAnalysis fills every collection',
    input: '{"events":[{"title":"X"}]}',
    check: (r) => {
      const s = shapeAnalysis(r.data);
      return Array.isArray(s.lists) && Array.isArray(s.vault) && Array.isArray(s.detectedGroups)
        && Array.isArray(s.questions) && s.events.length === 1;
    }
  },
  {
    name: 'shapeAnalysis caps questions at three',
    input: '{"questions":["a","b","c","d","e"]}',
    check: (r) => shapeAnalysis(r.data).questions.length === 3
  },
  {
    name: 'stripFences leaves a bare object alone',
    input: '{"a":1}',
    check: (r) => stripFences('{"a":1}') === '{"a":1}' && r.ok
  }
];

export function run() {
  const results = CASES.map((c) => {
    let ok = false, err = '';
    let parsed = null;
    try {
      parsed = parseTolerant(c.input);
      ok = !!c.check(parsed);
    } catch (e) {
      err = String(e && e.message ? e.message : e);
    }
    return { name: c.name, ok, err, parsed };
  });
  return {
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length
  };
}

/* node travel/js/parse.test.js */
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('parse.test.js')) {
  const { results, passed, failed } = run();
  results.forEach((r) => {
    if (!r.ok) console.log('FAIL  ' + r.name + (r.err ? ' — ' + r.err : '') + '\n      got: ' + JSON.stringify(r.parsed));
  });
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
