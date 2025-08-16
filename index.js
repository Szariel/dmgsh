const fs = require('fs');
const path = require('path');

module.exports.NetworkMod = function DmgSc(mod) {
  const cfgPath = path.join(__dirname, 'config.json');
  let cfg = loadCfg();

  const PRIMARY_KEYS = ['value','damage','hpDamage','amount','totalDamage','hpDamageAmount'];
  const HP_KEYS      = ['diff','delta','hpDiff','hpChange','change','value','amount'];

  const presentKeys = (ev, keys) => keys.filter(k => ev[k] != null && (typeof ev[k] === 'number' || typeof ev[k] === 'bigint'));

  function toKUnits(val) {
    if (typeof val === 'bigint') {
      const sign = val < 0n ? -1n : 1n;
      let abs = val < 0n ? -val : val;
      let out = (abs + 500n) / 1000n;
      if (out < 1n) out = 1n;
      return sign * out;
    } else {
      const sign = val < 0 ? -1 : 1;
      let abs = Math.abs(Number(val));
      let out = Math.round(abs / 1000);
      if (out < 1) out = 1;
      return sign * out;
    }
  }

  function processDamageLike(ev, keys) {
    if (!cfg.enabled) return false;
    const ks = presentKeys(ev, keys);
    if (ks.length === 0) return false;
    let changed = false;
    for (const k of ks) {
      const before = ev[k];
      const n = typeof before === 'bigint' ? Number(before) : Number(before);
      if (!Number.isFinite(n) || n <= 0) continue;
      const after = toKUnits(before);
      if ((typeof before === 'bigint') ? (before !== after) : (Number(before) !== Number(after))) {
        ev[k] = after;
        changed = true;
      }
    }
    return changed;
  }

  function processHpDelta(ev) {
    if (!cfg.enabled) return false;
    const ks = presentKeys(ev, HP_KEYS);
    if (ks.length === 0) return false;
    let changed = false;
    for (const k of ks) {
      const before = ev[k];
      const nBig = typeof before === 'bigint' ? before : BigInt(Math.trunc(Number(before)));
      if (nBig >= 0n) continue;
      const after = toKUnits(nBig);
      if (nBig !== after) {
        ev[k] = (typeof before === 'number') ? Number(after) : after;
        changed = true;
      }
    }
    return changed;
  }

  const canHook = (name) => { try { return mod.dispatch?.protocolMap?.name?.has(name); } catch { return false; } };
  const safeHook = (name, handler) => { if (canHook(name)) mod.hook(name, '*', { order: 100000 }, handler); };

  safeHook('S_EACH_SKILL_RESULT', (ev) => { if (processDamageLike(ev, PRIMARY_KEYS)) return true; });
  safeHook('S_SKILL_RESULT',       (ev) => { if (processDamageLike(ev, PRIMARY_KEYS)) return true; });
  safeHook('S_ABNORMALITY_DAMAGE', (ev) => { if (processDamageLike(ev, PRIMARY_KEYS)) return true; });
  safeHook('S_CREATURE_CHANGE_HP', (ev) => { if (processHpDelta(ev)) return true; });

  mod.command.add('dmgsh', (arg) => {
    const a = (arg || '').toLowerCase();
    if (a === 'on')  { cfg.enabled = true;  saveCfg(); mod.command.message('[dmgsh] Enabled');  return; }
    if (a === 'off') { cfg.enabled = false; saveCfg(); mod.command.message('[dmgsh] Disabled'); return; }
    mod.command.message(`[dmgsh] ${cfg.enabled ? 'ON' : 'OFF'} — 100700 → 101.`);
  });

  function loadCfg() { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return { enabled: true }; } }
  function saveCfg() { fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); }
};
