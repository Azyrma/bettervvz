// Main-thread handle to the search worker: call('search', params) resolves with the worker's result.
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let seq = 0;

worker.onmessage = ({ data: { id, result, error } }) => {
  const p = pending.get(id);
  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
};

export function call(type, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, params });
  });
}

// vvzapi.ch keys that switch the search box from local fuzzy search to the vvzapi.ch query language.
const KEYS = 'title|t|title_english|te|title_german|tg|number|n|lecturer|l|i|instructor|credits|c|ects|mv|year|y|semester|s|examtype|e|descriptions|d|descriptions_english|description_english|de|descriptions_german|description_german|dg|department|dept|dep|level|lvl|lev|priority|prio|restricted|restrict|primary_target_group|ptg|target|language|lang|offered|off|o|coursereview|cr';
const ADVANCED = new RegExp(`(^|[\\s(])-?(${KEYS})(:|!=|>=|<=|=|>|<)[^\\s:]|(^|\\s)-[^\\s\\d-]`, 'i');

export const isAdvancedQuery = q => ADVANCED.test(q) || /\sOR\s/.test(q);
