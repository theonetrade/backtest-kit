import Module, { createRequire } from 'module';

const require = createRequire(import.meta.url);

interface ModuleConstructor {
  _cache: Record<string, NodeModule>;
  new(id: string): NodeModule;
}

const ModuleWithCache = Module as unknown as ModuleConstructor;

function overrideModule(moduleName: string, newExports: unknown) {
  const cache = ModuleWithCache._cache;
  const key = require.resolve(moduleName);

  if (!cache[key]) {
    cache[key] = new ModuleWithCache(key);
    cache[key].loaded = true;
  }

  cache[key].exports = newExports;
}

export { overrideModule };
