/* DataLab — the pet: the companion equipped in the inventory (slot 'pet', one at a time) walks behind
   the player and stops when the player stops. It is an Actor for drawing and depth sorting (scene.js /
   iso.js), never a crew member: nothing else in the game sees it. Frames: DL.petSheet (cosmetics.js). */
(function () {
  'use strict';
  const DL = window.DL;
  const GAP = 13; // how far behind the player it settles (world px)

  DL.createPet = function (game) {
    const scene = game.scene, player = game.player;
    const P = { kind: null, actor: null, anim: 0 };

    function make(kind) {
      // an Actor without a character sheet: frame() comes from the pet sheet
      const a = Object.create(DL.Actor.prototype);
      Object.assign(a, { x: player.x - GAP, y: player.y, vx: 0, vy: 0, dir: 'right', dist: 0, moving: false, blinkIn: 99, blinkT: 0, pet: kind });
      const sheet = DL.petSheet(kind);
      a.frame = function () {
        const s = this.dir === 'left' ? sheet.left : sheet.right;
        return this.moving ? s.walk[Math.floor(Math.abs(this.dist) / 4) % 4] : s.idle[Math.floor(P.anim * 3) % 2];
      };
      return a;
    }
    function remove() {
      if (!P.actor) return;
      scene.actors = scene.actors.filter((x) => x !== P.actor);
      P.actor = null;
      P.kind = null;
      scene.refreshWorld(false);
    }
    // the equipped pet (inventory.js keeps it in DL.Skins.equipped.pet)
    function sync() {
      const id = DL.Skins.equipped.pet, it = id ? DL.cosmetic(id) : null, kind = it ? it.value : null;
      if (kind === P.kind) return;
      remove();
      if (!kind) return;
      P.kind = kind;
      P.actor = make(kind);
      scene.actors.push(P.actor);
      scene.refreshWorld(false);
    }

    function update(dt) {
      const a = P.actor;
      // the loop's first frame can hand a dt ≤ 0 (its rAF timestamp predates its start time)
      if (!a || !(dt > 0)) return;
      P.anim += dt;
      // it is only there when the player is (title screen, hidden while sitting in some views)
      a.hidden = !!player.hidden;
      if (!scene.actors.includes(a)) { scene.actors.push(a); scene.refreshWorld(false); }
      // the spot behind the player, on the side they came from
      const back = { down: [0, -1], up: [0, 1], left: [1, 0], right: [-1, 0] }[player.dir] || [0, -1];
      const tx = player.x + back[0] * GAP, ty = player.y + back[1] * GAP;
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d > 160) { a.x = tx; a.y = ty; a.moving = false; return; } // left far behind (a teleport, a new game)
      if (d < 3 || (!player.moving && d < 9)) { a.moving = false; return; }
      const sp = Math.min(d * 5, 95) * dt, step = Math.min(sp, d);
      if (!a.moving) a.dist = 0;
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      a.dist += step;
      a.moving = true;
      if (Math.abs(dx) > 0.5) a.dir = dx < 0 ? 'left' : 'right';
    }

    game.on('inventory', sync);
    sync();
    return { update, sync, get actor() { return P.actor; } };
  };
})();
