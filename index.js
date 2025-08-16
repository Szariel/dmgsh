const fs = require('fs');
const path = require('path');

module.exports.NetworkMod = function DmgSh(mod) {
  const cfgPath = path.join(__dirname, 'config.json');
  let cfg = loadCfg();

  const PRIMARY_KEYS = ['value','damage','hpDamage','amount','totalDamage','hpDamageAmount'];
  const HP_KEYS = ['diff','delta','hpDiff','hpChange','change','value','amount'];

  const presentKeys = (ev, keys) => keys.filter(k => ev[k] != null && (typeof ev[k] === 'number' || typeof ev[k] === 'bigint'));

  function isCrit(ev) {
    const ct = ev.critType;
    return !!(ev.crit ?? ev.critical ?? ev.isCritical ?? (ct === 1 || ct === 2));
  }

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
    if (!cfg.enabled) return;
    if (cfg.critOnly && !isCrit(ev)) return false;
    const ks = presentKeys(ev, keys);
    if (ks.length === 0) return;
    let changed = false;
    for (const k of ks) {
      const before = ev[k];
      const n = typeof before === 'bigint' ? Number(before) : Number(before);
      if (!Number.isFinite(n) || n <= 0) continue;
      const after = toKUnits(before);
      if ((typeof before === 'bigint') ? (before !== after) : (Number(before) !== Number(after))) {
        ev[k] = after; changed = true;
      }
    }
    return changed ? true : undefined;
  }

  function processHpDelta(ev) {
    if (!cfg.enabled) return;
    const ks = presentKeys(ev, HP_KEYS);
    if (ks.length === 0) return;
    if (cfg.critOnly) {
      for (const k of ks) {
        const v = ev[k];
        const n = (typeof v === 'bigint') ? v : BigInt(Math.trunc(Number(v)));
        if (n < 0n) return false;
      }
      return;
    }
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
    return changed ? true : undefined;
  }

  const canHook = (name) => { try { return mod.dispatch?.protocolMap?.name?.has(name); } catch { return false; } };
  const safeHook = (name, handler) => { if (canHook(name)) mod.hook(name, '*', { order: 100000 }, handler); };

  safeHook('S_EACH_SKILL_RESULT', (ev) => processDamageLike(ev, PRIMARY_KEYS));
  safeHook('S_SKILL_RESULT',       (ev) => processDamageLike(ev, PRIMARY_KEYS));
  safeHook('S_ABNORMALITY_DAMAGE', (ev) => processDamageLike(ev, PRIMARY_KEYS));
  safeHook('S_CREATURE_CHANGE_HP', (ev) => processHpDelta(ev));

  mod.command.add('dmgsh', (arg) => {
    const a = (arg || '').toLowerCase();
    if (a === 'on')  { cfg.enabled = true;  saveCfg(); mod.command.message('[dmgsh] Enabled');  return; }
    if (a === 'off') { cfg.enabled = false; saveCfg(); mod.command.message('[dmgsh] Disabled'); return; }
    if (a === 'crit') { cfg.critOnly = !cfg.critOnly; saveCfg(); mod.command.message(`[dmgsh] Crit-Only: ${cfg.critOnly ? 'ON' : 'OFF'}`); return; }
    mod.command.message(`[dmgsh] ${cfg.enabled ? 'ON' : 'OFF'} — /8 dmgsh crit toggelt Non-Crits aus.`);
  });

  function loadCfg() {
    try { const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); return Object.assign({ enabled: true, critOnly: false }, j); }
    catch { return { enabled: true, critOnly: false }; }
  }
  function saveCfg() { fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); }
};
