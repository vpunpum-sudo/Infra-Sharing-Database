// Projecting Firestore fake with optimistic transaction conflicts and observability.
const clone = value => value === undefined ? undefined : structuredClone(value);
function at(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
function project(data, fields) {
  if (!data || !fields) return clone(data);
  const result = {};
  for (const path of fields) {
    const value = at(data, path);
    if (value === undefined) continue;
    const keys = path.split('.'); let target = result;
    for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    target[keys.at(-1)] = clone(value);
  }
  return result;
}
function makeStore({ projects = {}, receipts = {}, users = {}, permissions = {}, settings,
  conflictModel = true } = {}) {
  const values = new Map(), versions = new Map();
  const events = { queries: [], getAll: [], reads: [], docGets: [], writes: [], transactions: 0, conflicts: 0 };
  for (const [collection, documents] of Object.entries({ projects, approvalEmailDeliveries: receipts, users, rolePermissions: permissions })) {
    for (const [id, data] of Object.entries(documents)) values.set(`${collection}/${id}`, clone(data));
  }
  if (settings !== undefined) values.set('approvalReminderSettings/current', clone(settings));
  const db = {
    events, values, beforeRecheck: null, failSet: null, failGet: null,
    put(path, value) { values.set(path, clone(value)); versions.set(path, (versions.get(path) || 0) + 1); },
    data(path) { return clone(values.get(path)); },
    snapshot(ref, fields) { return { id: ref.id, ref, exists: values.has(ref.path), data: () => project(values.get(ref.path), fields) }; },
    collection(name) {
      function query(spec = {}) {
        return {
          where(field, op, value) { return query({ ...spec, filter: [field, op, value] }); },
          orderBy(order) { return query({ ...spec, order }); },
          select(...fields) { return query({ ...spec, fields }); },
          limit(limit) { return query({ ...spec, limit }); },
          startAfter(doc) { return query({ ...spec, cursor: doc.id }); },
          async get() {
            if (db.failGet?.(name)) throw new Error('injected read failure');
            events.queries.push({ collection: name, ...clone(spec) });
            let ids = [...values.keys()].filter(path => path.startsWith(name + '/')).map(path => path.slice(name.length + 1)).sort();
            if (spec.filter) ids = ids.filter(id => at(values.get(`${name}/${id}`), spec.filter[0]) === spec.filter[2]);
            if (spec.cursor) ids = ids.filter(id => id > spec.cursor);
            ids = ids.slice(0, spec.limit ?? ids.length);
            const docs = ids.map(id => db.snapshot(db.collection(name).doc(id), spec.fields));
            events.reads.push(...ids.map(id => `${name}/${id}`));
            return { docs, size: docs.length, empty: !docs.length };
          },
          doc(id) {
            const ref = { id, path: `${name}/${id}`,
              async get() {
                if (db.failGet?.(ref.path)) throw new Error('injected read failure');
                events.reads.push(ref.path); events.docGets.push(ref.path); return db.snapshot(ref);
              },
              async set(data, options) {
                if (db.failSet?.(ref.path, data)) throw new Error('injected write failure');
                events.writes.push({ path: ref.path, data: clone(data) });
                db.put(ref.path, options?.merge ? { ...values.get(ref.path), ...data } : data);
              } };
            return ref;
          }
        };
      }
      return query();
    },
    async getAll(...args) {
      const options = args.at(-1)?.fieldMask ? args.pop() : undefined;
      events.getAll.push({ paths: args.map(ref => ref.path), fieldMask: clone(options?.fieldMask) });
      if (args[0]?.path.startsWith('projects/') && db.beforeRecheck) await db.beforeRecheck(args[0].id);
      for (const ref of args) {
        if (db.failGet?.(ref.path)) throw new Error('injected read failure');
        events.reads.push(ref.path);
      }
      return args.map(ref => db.snapshot(ref, options?.fieldMask));
    },
    async runTransaction(callback) {
      events.transactions++;
      for (let retry = 0; retry < 5; retry++) {
        const readVersions = new Map(), writes = [];
        const result = await callback({
          async get(ref) { readVersions.set(ref.path, versions.get(ref.path) || 0); events.reads.push(ref.path);
            const snapshot = db.snapshot(ref); const data = snapshot.data(); return { ...snapshot, data: () => clone(data) }; },
          set(ref, data, options) { writes.push({ ref, data, options }); }
        });
        await new Promise(resolve => setImmediate(resolve));
        if (conflictModel && [...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) {
          events.conflicts++; continue;
        }
        for (const { ref, data, options } of writes) await ref.set(data, options);
        return result;
      }
      throw new Error('transaction conflicts exhausted');
    }
  };
  return db;
}
module.exports = { makeStore };
