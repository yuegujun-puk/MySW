/**
 * 实验室 · 森林冰火人（Fireboy & Watergirl 双人合作）
 * · 火男孩怕水湖、水女孩怕火湖，两人都怕绿色毒泥；
 * · 石头可以推、会下落，能垫脚、能填坑搭桥；
 * · 踩下浸在湖底的压力钮，会打开另一颜色路上的门（合作核心）；
 * · 升降台会把人托到高处。
 * 操作：方向键 = 火男孩，WASD = 水女孩；单人模式一人控俩。
 * 与 AI 同玩：选「你控一个、AI 控另一个」或「看 AI 双人演示」。
 */
(function () {
    'use strict';

    /*__PURE_START__*/

    /* ---------------- 物理常量（单位：格） ----------------
       跳跃高度 = jumpV² / (2g) = 15.5² / 72 ≈ 3.33 格
       滞空时间 = 2·jumpV / g ≈ 0.86s → 跑跳水平距离 ≈ 0.86 × 4.6 ≈ 3.96 格
       所以关卡里所有「必须跳上去」的台阶都 ≤3 格高、沟都 ≤3 格宽。 */
    const PHYS = { g: 36, walk: 4.6, jumpV: 15.5, maxFall: 22, dt: 1 / 60 };
    const CHAR_W = 0.62, CHAR_H = 0.86;
    const ROCK_W = 0.94, ROCK_H = 0.94;
    const MOVER_W = 2.0, MOVER_H = 0.42;

        /**
     * 图例：
     * # 墙/地      . 空气
     * P 火男孩出生  Q 水女孩出生
     */
    const LEVELS = [
        {
            name: '第一关 · 苔径初识',
            tip: '方向键控火男孩、WASD 控水女孩。注意出口在对面:火男孩出生在左、出口在右,水女孩反过来。中间的绿泥谁碰都会死,跳过去。宝石是加分项。',
            map: [
                '........................',
                '........................',
                '........................',
                '........................',
                '.....f..........w.......',
                '....###........###......',
                '........................',
                '.P.E................D.Q.',
                '###########GG###########',
                '###########GG###########'
            ]
        },
        {
            name: '第二关 · 湖底钮与垫脚石',
            tip: '火湖淹不死火男孩:跳进火湖踩住湖底的橙色压力钮 A,出口之间的橙色闸门 A 才会打开。水宝石在高台上,把石头推到台子左边垫脚才够得着。',
            map: [
                '..........................',
                '..........................',
                '..........................',
                '..........................',
                '..........................',
                '..........................',
                '..........................',
                '.............w...f..!.....',
                '............###.###.!.....',
                '....................!.....',
                '.P.Q.......O.......D!E....',
                '######F3F#################',
                '##########################'
            ]
        },
        {
            name: '第三关 · 双湖互锁',
            tip: '这关两人互相卡着:火湖底的橙色钮 A 开着水女孩路上的橙色闸门 A,水湖底的紫色钮 B 开着你路上的紫色闸门 B。各自趟过自己的湖(别碰对方的湖和中间的绿泥)踩钮,等对方的闸门开了再走。中间绿泥上方的移台托人去高台拿双宝石,纯加分项。',
            map: [
                '............................',
                '............................',
                '............................',
                '............................',
                '............................',
                '..............fw............',
                '.............####...........',
                '............................',
                '............................',
                '........@...........!.......',
                '........@....v......!.......',
                '........@...........!.......',
                '.P......@.D.......E.!....O.Q',
                '#####F3F#####GGG#####W4W####',
                '############################'
            ]
        }
    ];

    const LAKE_NONE = 0, LAKE_FIRE = 1, LAKE_WATER = 2, LAKE_GOO = 3;

    /** 把字符地图解析成世界对象（不含任何 DOM） */
    function parseLevel(def) {
        const rows = def.map;
        const rws = rows.length, cols = rows[0].length;
        const w = {
            name: def.name, tip: def.tip || '',
            mapRows: rows,
            cols, rows: rws,
            wall: new Uint8Array(cols * rws),
            lake: new Uint8Array(cols * rws),
            button: [],          // {tx, ty, id, pressed}
            doors: [],           // {tx, ty, id, open}
            gems: [],            // {tx, ty, color, taken}
            rocks: [],           // 实体
            movers: [],          // {x,y,axis,min,max,t,speed,dir,px,py}
            starts: { fire: null, water: null },
            exits: { fire: null, water: null },
            // 工坊关卡带过来的逐格外观/碰撞覆盖，键为 "x,y"。内置关卡没有这个字段。
            props: def.props || {}
        };
        const idx = (x, y) => y * cols + x;
        for (let y = 0; y < rws; y++) {
            const line = rows[y];
            for (let x = 0; x < cols; x++) {
                const c = line[x] || '.';
                if (c === '#') w.wall[idx(x, y)] = 1;
                else if (c === 'F') w.lake[idx(x, y)] = LAKE_FIRE;
                else if (c === 'W') w.lake[idx(x, y)] = LAKE_WATER;
                else if (c === 'G') w.lake[idx(x, y)] = LAKE_GOO;
                else if (c === 'P') w.starts.fire = { x: x + 0.5, y: y + 1 };
                else if (c === 'Q') w.starts.water = { x: x + 0.5, y: y + 1 };
                else if (c === 'f') w.gems.push(Object.assign({ tx: x, ty: y, color: 'fire', taken: false }, visualOf(def, x, y)));
                else if (c === 'w') w.gems.push(Object.assign({ tx: x, ty: y, color: 'water', taken: false }, visualOf(def, x, y)));
                else if (c === 'O') w.rocks.push(Object.assign(makeRock(x + 0.5, y + 1), visualOf(def, x, y)));
                else if (c === 'D') w.exits.fire = Object.assign({ tx: x, ty: y }, visualOf(def, x, y));
                else if (c === 'E') w.exits.water = Object.assign({ tx: x, ty: y }, visualOf(def, x, y));
                else if (c === '!') w.doors.push(Object.assign({ tx: x, ty: y, id: 'A', open: false }, visualOf(def, x, y)));
                else if (c === '@') w.doors.push(Object.assign({ tx: x, ty: y, id: 'B', open: false }, visualOf(def, x, y)));
                else if (c === '3') { w.lake[idx(x, y)] = LAKE_FIRE; w.button.push(Object.assign({ tx: x, ty: y, id: 'A', pressed: false }, visualOf(def, x, y))); }
                else if (c === '4') { w.lake[idx(x, y)] = LAKE_WATER; w.button.push(Object.assign({ tx: x, ty: y, id: 'B', pressed: false }, visualOf(def, x, y))); }
                else if (c === 'h') w.movers.push(makeMover(x, y, 'x', propAt(def, x, y)));
                else if (c === 'v') w.movers.push(makeMover(x, y, 'y', propAt(def, x, y)));
            }
        }
        return w;
    }

    function makeRock(cx, by) {
        return { x: cx - ROCK_W / 2, y: by - ROCK_H, vx: 0, vy: 0, w: ROCK_W, h: ROCK_H, onGround: false, isRock: true };
    }
    function makeMover(tx, ty, axis, prop) {
        // 横移台默认左右各 3 格、升降台上下各 2 格；工坊可以改行程和速度
        const p = prop || {};
        const travel = clampNum(p.travel, axis === 'x' ? 3 : 2, 1, 8);
        return {
            x: tx, y: ty, w: MOVER_W, h: MOVER_H,
            axis, min: axis === 'x' ? tx - travel : ty - travel, max: axis === 'x' ? tx + travel : ty + travel,
            dir: 1, speed: clampNum(p.speed, 1.6, 0.4, 6), px: tx, py: ty,
            color: p.color || '', art: p.art || ''
        };
    }

    function clampNum(v, dflt, min, max) {
        const n = Number(v);
        if (!isFinite(n)) return dflt;
        return Math.max(min, Math.min(max, n));
    }

    function makeChar(kind, sx, sy) {
        return { kind, x: sx - CHAR_W / 2, y: sy - CHAR_H, vx: 0, vy: 0, w: CHAR_W, h: CHAR_H, onGround: false, facing: 1, atDoor: false, dead: false };
    }

    /** 静态碰撞快照：墙 + 未开的门。AI 模拟与真实物理共用。
        工坊可以把某一格标成「不挡路」(hit:none) 或「只挡下半格」(hit:half)，
        下半格用 2 标记，解析时按单向踏板处理。 */
    function buildSolidGrid(w) {
        const g = new Uint8Array(w.wall);
        if (w.props) {
            for (let y = 0; y < w.rows; y++) for (let x = 0; x < w.cols; x++) {
                const hit = (w.props[x + ',' + y] || {}).hit;
                if (!g[y * w.cols + x]) continue;
                if (hit === 'none') g[y * w.cols + x] = 0;
                else if (hit === 'half') g[y * w.cols + x] = 2;
            }
        }
        for (const d of w.doors) if (!d.open && d.hit !== 'none') {
            g[d.ty * w.cols + d.tx] = d.hit === 'half' ? 2 : 1;
        }
        return g;
    }

    function propAt(def, x, y) {
        return (def.props && def.props[x + ',' + y]) || {};
    }
    function visualOf(def, x, y) {
        const p = propAt(def, x, y);
        // color 这个名字被宝石拿去表示火/水归属了，外观色改叫 colorTint，避免覆盖
        return { colorTint: p.color || '', art: p.art || '', hit: p.hit || '' };
    }

    function tileSolidAt(grid, cols, rows, tx, ty) {
        if (tx < 0 || tx >= cols) return true;      // 边界当墙
        if (ty < 0) return false;                   // 顶部允许跳出画面一点
        if (ty >= rows) return true;
        return grid[ty * cols + tx] === 1;          // 2 = 半格踏板，不在这里挡全身
    }

    /** 半格踏板：只有「往下落、且起跳前脚在踏板顶面之上」才承接，能跳上去但不能从下面撞头 */
    function landOnHalf(S, e, prevFeet) {
        const x0 = Math.floor(e.x + 0.001), x1 = Math.floor(e.x + e.w - 0.001);
        const ty = Math.floor(e.y + e.h);
        const top = ty + 0.5;
        if (prevFeet > top + 0.06) return false;
        for (let tx = x0; tx <= x1; tx++) {
            if (tx < 0 || tx >= S.cols || ty < 0 || ty >= S.rows) continue;
            if (S.grid[ty * S.cols + tx] === 2 && e.y + e.h >= top) {
                e.y = top - e.h - 0.001; e.vy = 0; e.onGround = true; return true;
            }
        }
        return false;
    }

    /** 动态固体（石头/移台）AABB 列表 */
    function dynList(w, freezeMovers) {
        const list = [];
        for (const r of w.rocks) list.push(r);
        for (const m of w.movers) list.push(m);
        return list;
    }

    function overlapDyn(e, d) {
        return e.x < d.x + d.w && e.x + e.w > d.x && e.y < d.y + d.h && e.y + e.h > d.y;
    }

    /**
     * 核心物理：一步积分 + 分轴碰撞。
     * S = { grid, cols, rows, dyn }；input = {left,right,jump}
     * 返回 { groundDyn }（站在哪个动态固体上，用于搭乘）
     * 纯函数语义：只改传入的 e，不碰世界其它状态。
     */
    function stepEntity(S, e, input, dt) {
        // 水平加速/摩擦
        const target = (input.left ? -PHYS.walk : 0) + (input.right ? PHYS.walk : 0);
        if (target !== 0) {
            const a = PHYS.walk * 14;
            e.vx += Math.sign(target - e.vx) * Math.min(a * dt, Math.abs(target - e.vx));
            e.facing = Math.sign(target);
        } else {
            const f = (e.onGround ? 34 : 8) * dt;
            if (Math.abs(e.vx) <= f) e.vx = 0; else e.vx -= Math.sign(e.vx) * f;
        }
        // 跳跃（只在接地时）
        if (input.jump && e.onGround) { e.vy = -PHYS.jumpV; e.onGround = false; }
        // 重力
        e.vy = Math.min(e.vy + PHYS.g * dt, PHYS.maxFall);

        let groundDyn = null;

        // ---- X 轴 ----
        let dx = e.vx * dt;
        e.x += dx;
        if (dx !== 0) {
            // 先解静态格
            resolveX(S, e, dx);
            // 再解动态固体；撞到石头且石头可被推动 → 推石头
            // （移台是单向平台，不做横向阻挡，否则会把 BFS 规划好的路线卡住）
            for (const d of S.dyn) {
                if (d.axis) continue;
                if (!overlapDyn(e, d)) continue;
                if (d.isRock && e.onGround && Math.abs(e.vy) < 1) {
                    const pushDir = Math.sign(dx);
                    if (canRockSlide(S, d, pushDir)) { d.x += dx; e.x += 0; continue; }
                }
                if (dx > 0) e.x = d.x - e.w; else e.x = d.x + d.w;
                e.vx = 0;
            }
        }
        // ---- Y 轴 ----
        const prevFeet = e.y + e.h;
        let dy = e.vy * dt;
        e.y += dy;
        e.onGround = false;
        if (dy !== 0) {
            resolveY(S, e, dy);
            if (dy > 0 && !e.onGround) landOnHalf(S, e, prevFeet);
            for (const d of S.dyn) {
                if (!overlapDyn(e, d)) continue;
                if (d.axis) {
                    // 单向平台：只有「下落中且起跳前脚在台面之上」才承接，
                    // 从下往上跳可以穿过台面（经典平台手感）。
                    if (dy > 0 && prevFeet <= d.y + 0.06) {
                        e.y = d.y - e.h; e.vy = 0; e.onGround = true; groundDyn = d;
                    }
                    continue;
                }
                if (dy > 0) { e.y = d.y - e.h; e.vy = 0; e.onGround = true; groundDyn = d; }
                else { e.y = d.y + d.h; e.vy = 0; }
            }
        }
        return { groundDyn };
    }

    function resolveX(S, e, dx) {
        const y0 = Math.floor(e.y + 0.001), y1 = Math.floor(e.y + e.h - 0.001);
        if (dx > 0) {
            const tx = Math.floor(e.x + e.w);
            for (let ty = y0; ty <= y1; ty++) {
                if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) { e.x = tx - e.w - 0.001; e.vx = 0; return; }
            }
        } else if (dx < 0) {
            const tx = Math.floor(e.x);
            for (let ty = y0; ty <= y1; ty++) {
                if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) { e.x = tx + 1 + 0.001; e.vx = 0; return; }
            }
        }
    }

    function resolveY(S, e, dy) {
        const x0 = Math.floor(e.x + 0.001), x1 = Math.floor(e.x + e.w - 0.001);
        if (dy > 0) {
            const ty = Math.floor(e.y + e.h);
            for (let tx = x0; tx <= x1; tx++) {
                if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) { e.y = ty - e.h - 0.001; e.vy = 0; e.onGround = true; return; }
            }
        } else if (dy < 0) {
            const ty = Math.floor(e.y);
            for (let tx = x0; tx <= x1; tx++) {
                if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) { e.y = ty + 1 + 0.001; e.vy = 0; return; }
            }
        }
    }

    /** 石头能否被水平推动：同排目标格空、石头下方有支撑 */
    function canRockSlide(S, rock, dir) {
        const probe = { x: rock.x + dir * 0.06, y: rock.y, w: rock.w, h: rock.h };
        const tx = dir > 0 ? Math.floor(probe.x + probe.w) : Math.floor(probe.x);
        const ty0 = Math.floor(probe.y + 0.02), ty1 = Math.floor(probe.y + probe.h - 0.02);
        for (let ty = ty0; ty <= ty1; ty++) if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) return false;
        for (const d of S.dyn) if (d !== rock && overlapDyn(probe, d)) return false;
        return true;
    }

    /** 石头物理：下落 + 被推时的惯性滑动（简化：推时由角色直接位移，这里只管下落与落稳） */
    function stepRock(S, r, dt) {
        r.vy = Math.min(r.vy + PHYS.g * dt, PHYS.maxFall);
        const prevFeet = r.y + r.h;
        r.y += r.vy * dt;
        r.onGround = false;
        const x0 = Math.floor(r.x + 0.02), x1 = Math.floor(r.x + r.w - 0.02);
        if (r.vy >= 0) {
            const ty = Math.floor(r.y + r.h);
            for (let tx = x0; tx <= x1; tx++) {
                if (tileSolidAt(S.grid, S.cols, S.rows, tx, ty)) { r.y = ty - r.h - 0.001; r.vy = 0; r.onGround = true; break; }
            }
            if (!r.onGround) landOnHalf(S, r, prevFeet);
            if (!r.onGround) for (const d of S.dyn) {
                if (d === r) continue;
                if (overlapDyn(r, d) && r.vy >= 0) { r.y = d.y - r.h - 0.001; r.vy = 0; r.onGround = true; break; }
            }
        }
    }

    /* ---------------- BFS 规划器（AI 与「提示」共用） ---------------- */
    /* 跳跃动作窗口 0.78s：起跳后约 0.43s 到顶点（3.3 格），
       0.55s 后开始回落 —— 窗口必须覆盖「越过 3 格高台边缘并落到台面上」
       的那一刻，太短会撞在台壁上，太长会飞过台面。 */
    const ACTIONS = [
        { name: 'L', dir: -1, t: 0.30, jump: false },
        { name: 'R', dir: 1, t: 0.30, jump: false },
        { name: 'JL', dir: -1, t: 0.78, jump: true },
        { name: 'JR', dir: 1, t: 0.78, jump: true },
        { name: 'JU', dir: 0, t: 0.78, jump: true },
        { name: 'W', dir: 0, t: 0.16, jump: false }
    ];

    /**
     * AI 规划用的世界快照：石头/移台**冻结为静态障碍**。
     * 理由：BFS 的每个分支共享同一份 dyn 数组，若允许模拟里推石头，
     * 一个分支的推动会污染其它分支（石头位置是全局的）。
     * 所以 AI 只会「利用已经到位的石头当台阶」，不会规划推石头；
     * 推石头留给玩家当高级技巧（把石头推进毒泥搭桥、垫脚拿高台宝石）。
     */
    function snapshotForSim(w) {
        return {
            grid: buildSolidGrid(w), cols: w.cols, rows: w.rows,
            // 只冻结石头：移台在不停运动，把它当平台规划出的跳跃
            // 在真实世界里会对不上时机。AI 因此只走静态几何，
            // 升降台留给玩家（和演示模式里的宝石）当彩蛋。
            dyn: w.rocks.map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, isRock: true, axis: undefined }))
        };
    }

    function simAction(S, ent, act, deathCheck) {
        const e = { x: ent.x, y: ent.y, vx: ent.vx, vy: ent.vy, w: ent.w, h: ent.h, onGround: ent.onGround, facing: ent.facing };
        const input = { left: act.dir < 0, right: act.dir > 0, jump: act.jump };
        const steps = Math.round(act.t / PHYS.dt);
        for (let i = 0; i < steps; i++) {
            // 跳跃只在第一帧按下：模拟真实玩家「点跳」，
            // 全程按住会在落地瞬间二次起跳，让规划出的路线和手感对不上。
            stepEntity(S, e, i === 0 ? input : { left: input.left, right: input.right, jump: false }, PHYS.dt);
            if (deathCheck && deathCheck(e)) return null;
        }
        // 【不要加「落地稳定帧」】以前这里会在动作结束后补 6 帧零输入，
        // 但真实执行时动作之间是无缝衔接的 —— 模拟比执行多出一段减速间隙，
        // 轨迹逐动作漂移，BFS 就会把「执行时会掉进坑里」的路线当成安全路线。
        // 模拟必须与执行逐帧同构：动作结束的状态直接入队。
        if (deathCheck && deathCheck(e)) return null;
        return e;
    }

    function entKey(e) {
        return (Math.round(e.x * 2)) + '|' + (Math.round(e.y * 2)) + '|' + (e.onGround ? 1 : 0);
    }

    /**
     * 规划从 ent 到满足 pred(e) 的状态的动作序列。
     * deathCheck(e)：模拟中踩到会死的格子就剪枝（AI 不会自杀式跑图）。
     * 返回 [{name,dir,t,jump},...] 或 null。
     */
    function planRoute(S, ent, pred, deathCheck, cap) {
        if (pred(ent)) return [];
        const limit = cap || 2600;
        const startKey = entKey(ent);
        const seen = new Set([startKey]);
        let frontier = [{ e: ent, plan: [] }];
        let expanded = 0;
        while (frontier.length && expanded < limit) {
            const next = [];
            for (const node of frontier) {
                for (const act of ACTIONS) {
                    const e2 = simAction(S, node.e, act, deathCheck);
                    if (!e2) continue;
                    const k = entKey(e2);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    const plan = node.plan.concat([act]);
                    if (pred(e2)) return plan;
                    next.push({ e: e2, plan });
                    expanded++;
                    if (expanded >= limit) break;
                }
                if (expanded >= limit) break;
            }
            frontier = next;
        }
        return null;
    }

    /** 格子湖泊对某角色是否致命 */
    function lakeKills(lakeType, kind) {
        if (lakeType === LAKE_GOO) return true;
        if (lakeType === LAKE_FIRE) return kind !== 'fire';
        if (lakeType === LAKE_WATER) return kind !== 'water';
        return false;
    }

    /** 实体脚部所在格的湖类型 */
    function lakeAtFeet(w, e) {
        const tx = Math.floor(e.x + e.w / 2), ty = Math.floor(e.y + e.h - 0.12);
        if (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) return LAKE_NONE;
        return w.lake[ty * w.cols + tx];
    }

    function entOverTile(e, tx, ty) {
        return e.x < tx + 1 && e.x + e.w > tx && e.y < ty + 1 && e.y + e.h > ty;
    }

    /*__PURE_END__*/

    /* ============================================================
       渲染 / 输入 / 游戏循环（以下才碰 DOM）
 */
    const TILE = 34;
    const COLORS = {
        wall: '#3d3325', wallTop: '#57492f',
        fire: '#ff7a3c', water: '#4fb7ff',
        // 液体:深色底 + 亮色液面,三种一眼可分
        lavaDeep: '#7a1d0c', lavaTop: '#ff6a2a', lavaGlow: '#ffd36a',
        waterDeep: '#123f7a', waterTop: '#5cc4ff',
        gooDeep: '#1f3d1a', gooTop: '#9be85a', gooStripe: 'rgba(0,0,0,.28)',
        lakeFire: 'rgba(255,90,40,.55)', lakeWater: 'rgba(60,150,255,.5)', lakeGoo: 'rgba(120,220,80,.6)',
        // 宝石:圆形(火=红 / 水=亮青)
        gemFire: '#ff5a3c', gemWater: '#4fd8ff',
        // 石头:圆角灰石
        rock: '#9aa3ad', rockEdge: '#4a5058',
        // 移台:浅木色 + 斜纹(会动)
        mover: '#c79a4a', moverStripe: 'rgba(60,35,10,.45)', moverEdge: '#5b3d12',
        // 闸门与压力钮:A=琥珀、B=紫,压力钮与它控制的闸门同色
        doorA: '#ffb020', doorB: '#b57bff', plateOn: '#c8ffd0',
        door: '#c9a24a',
        // 出口:火=橙红、水=天蓝
        exitFire: '#ff7a3c', exitWater: '#4fb7ff'
    };
    function gateColor(id) { return id === 'B' ? COLORS.doorB : COLORS.doorA; }
    function rr(g, x, y, w, h, r) {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
    }

    const SAVE_KEY = 'forestIcefireSave';
    const state = {
        levelIndex: 0,
        w: null,
        fire: null, water: null,
        mode: 'solo',            // solo | duo | demo
        playerChar: 'fire',      // duo 模式下玩家控制的角色（默认火男孩）
        running: false,
        over: false,
        win: false,
        gemsTaken: 0, gemsTotal: 0,
        time: 0,
        deaths: 0,
        aiPlan: { fire: null, water: null },
        aiTick: 0,
        chat: [],
        thinking: false,
        keys: {},
        overHintAt: 0,
        lastTs: 0,
        raf: 0
    };
    let root = null;
    let canvas = null;
    let ctx2d = null;

    function currentFriend() {
        const id = window.getCurrentFriendId?.();
        const friends = window.getFriends?.() || {};
        return id && friends[id] ? { id, ...friends[id] } : null;
    }
    function settings() {
        const main = window.getMainApiSettings?.() || {};
        if (main.apiUrl && main.modelName) return main;
        try {
            const stored = JSON.parse(localStorage.getItem('aiChatSettings') || '{}');
            return {
                ...stored, ...main,
                apiUrl: main.apiUrl || stored.apiUrl || '',
                apiKey: main.apiKey || stored.apiKey || '',
                modelName: main.modelName || stored.modelName || ''
            };
        } catch (e) { return main; }
    }

    /* ---------------- 关卡装载 ---------------- */
    function loadLevel(i) {
        const list = allLevels();
        if (i < 0 || i >= list.length) i = 0;
        state.levelIndex = i;
        const def = list[i];
        if (!def) return;
        let world;
        try { world = parseLevel(def); }
        catch (e) { pushChat('system', '「' + (def.name || '关卡') + '」解析失败，这关玩不了。'); return; }
        if (!world.starts.fire || !world.starts.water) {
            pushChat('system', '「' + (def.name || '关卡') + '」缺少火男孩或水女孩的出生点，这关玩不了。');
            return;
        }
        state.w = world;
        const w = state.w;
        state.fire = makeChar('fire', w.starts.fire.x, w.starts.fire.y);
        state.water = makeChar('water', w.starts.water.x, w.starts.water.y);
        state.gemsTotal = w.gems.length;
        state.gemsTaken = 0;
        state.over = false;
        state.win = false;
        state.time = 0;
        state.overHintAt = 0;
        state.aiPlan = { fire: null, water: null };
        state.chat = [];
        // 聊天栏 DOM 与已渲染计数必须一起复位：
        // 只清数组不清 DOM，旧消息还挂在栏里；只清 DOM 不复位计数，
        // renderChat 的增量循环会从旧计数开始、永远画不出新消息。
        renderedChatCount = 0;
        const chatBox = root?.querySelector('#fif-chat');
        if (chatBox) chatBox.innerHTML = '';
        pushChat('system', `进入「${w.name}」。${w.tip}`);
        syncSide();
    }

    function restartLevel() {
        loadLevel(state.levelIndex);
    }

    /* ---------------- 每帧世界更新 ---------------- */
    function worldStep(dt) {
        const w = state.w;
        if (!w) return;
        // 1) 移台先动（记录位移供搭乘）
        for (const m of w.movers) {
            m.px = m.x; m.py = m.y;
            const delta = m.speed * dt;
            if (m.axis === 'x') {
                m.x += m.dir * delta;
                if (m.x < m.min) { m.x = m.min; m.dir = 1; }
                if (m.x > m.max) { m.x = m.max; m.dir = -1; }
            } else {
                m.y += m.dir * delta;
                if (m.y < m.min) { m.y = m.min; m.dir = 1; }
                if (m.y > m.max) { m.y = m.max; m.dir = -1; }
            }
        }
        // 2) 物理快照
        const S = { grid: buildSolidGrid(w), cols: w.cols, rows: w.rows, dyn: dynList(w) };
        // 3) 石头先落
        for (const r of w.rocks) stepRock(S, r, dt);
        // 4) 角色
        const inputs = readInputs();
        const chars = [state.fire, state.water];
        const grounds = [];
        chars.forEach((c, ci) => {
            if (c.dead) { grounds.push(null); return; }
            const res = stepEntity(S, c, inputs[ci], dt);
            grounds.push(res.groundDyn);
            c.onRock = Boolean(res.groundDyn && res.groundDyn.isRock);
            // 搭乘移台
            if (res.groundDyn && res.groundDyn.axis) {
                c.x += res.groundDyn.x - res.groundDyn.px;
                c.y += res.groundDyn.y - res.groundDyn.py;
            }
        });
        // 5) 湖判定 / 宝石 / 按钮 / 门 / 出口
        chars.forEach(c => {
            if (c.dead) return;
            // 站在石头上时不看脚下的湖：石头可以被推进毒泥/湖里当桥，
            // 此时脚部坐标虽然落在致命格上，但人是踩在石头顶面的。
            if (!c.onRock) {
                const lake0 = lakeAtFeet(w, c);
                if (lakeKills(lake0, c.kind)) { killChar(c); return; }
            }
            // 宝石
            for (const g of w.gems) {
                if (g.taken || g.color !== c.kind) continue;
                if (entOverTile(c, g.tx, g.ty)) {
                    g.taken = true;
                    state.gemsTaken++;
                    pushChat('system', `${c.kind === 'fire' ? '火男孩' : '水女孩'} 捡到了一颗${g.color === 'fire' ? '火' : '水'}宝石（${state.gemsTaken}/${state.gemsTotal}）。`);
                }
            }
            // 压力钮：只有对应颜色敢踩（另一个碰到湖就死了）
            for (const b of w.button) {
                const on = entOverTile(c, b.tx, b.ty);
                if (on && !b.pressed) {
                    b.pressed = true;
                    // 门是多格高的门柱（同一 id 多个格子），必须整柱同开；
                    // 只开第一格的话剩下的格子还是墙，人照样过不去。
                    w.doors.forEach(d => { if (d.id === b.id) d.open = true; });
                    pushChat('system', `压力钮被踩下,闸门${b.id}开了!`);
                }
            }
            // 出口
            const ex = w.exits[c.kind];
            if (ex && entOverTile(c, ex.tx, ex.ty)) c.atDoor = true; else c.atDoor = false;
        });
        // 6) 胜负
        if (state.fire.atDoor && state.water.atDoor && !state.over) {
            state.over = true;
            state.win = true;
            pushChat('system', `通关！用时 ${state.time.toFixed(1)} 秒，宝石 ${state.gemsTaken}/${state.gemsTotal}。`);
            aiSayWin();
            syncSide();
        }
        if ((state.fire.dead || state.water.dead) && !state.over) {
            state.over = true;
            state.win = false;
            state.deaths++;
            pushChat('system', `${state.fire.dead ? '火男孩' : '水女孩'} 没了……按「重来」再试一次。`);
            syncSide();
        }
    }

    function killChar(c) {
        c.dead = true;
    }

    /* ---------------- 输入 ----------------
       方向键/空格 = 火男孩；WASD = 水女孩。
       solo 模式：两套键都同时驱动两个角色（一人控俩）。
       duo 模式：玩家只控自己选的那个，另一个交给 AI。
       demo 模式：两个都交给 AI。 */
    function readInputs() {
        const k = state.keys;
        const tf = touchOf('fire'), tw = touchOf('water');
        const fireKeys = { left: !!k.ArrowLeft || tf.left, right: !!k.ArrowRight || tf.right, jump: !!(k.ArrowUp || k.Space) || tf.jump };
        const waterKeys = { left: !!k.KeyA || tw.left, right: !!k.KeyD || tw.right, jump: !!k.KeyW || tw.jump };
        if (state.mode === 'solo') return [fireKeys, waterKeys];
        if (state.mode === 'demo') return [aiInput('fire'), aiInput('water')];
        // duo：玩家角色用对应键，另一个用 AI
        if (state.playerChar === 'fire') return [fireKeys, aiInput('water')];
        return [aiInput('fire'), waterKeys];
    }

    /** 把 BFS 计划转成当前帧的输入。
        跳跃只在动作的第一帧按下 —— 与 simAction 的模拟口径完全一致；
        若整段按住，角色落地瞬间会二次起跳，真实轨迹就偏离了规划，
        会跳进规划时认为安全的坑里。 */
    function aiInput(kind) {
        const plan = state.aiPlan[kind];
        if (!plan || !plan.length) return { left: false, right: false, jump: false };
        const act = plan[0];
        const firstFrame = (plan._t || 0) === 0;
        const out = { left: act.dir < 0, right: act.dir > 0, jump: Boolean(act.jump) && firstFrame };
        plan._t = (plan._t || 0) + PHYS.dt;
        if (plan._t >= act.t) { plan.shift(); plan._t = 0; }
        return out;
    }

    /** 为某个角色重算 BFS 计划。
        目标优先级（含协作）：
          1. 自己已到门口、但搭档还没到 → 先去踩自己够得着的压力钮帮搭档开门；
          2. 同色宝石；
          3. 自己的出口；
          4. 任何自己踩得安全的压力钮；
          5. 原地等。
        （AI 不会推石头/不会乘移台，所以「要垫石头才够的宝石」和「移台上的宝石」
          会规划失败并自动跳到下一级目标，保证演示模式一定能通关。） */
    function replan(kind) {
        const w = state.w;
        const c = kind === 'fire' ? state.fire : state.water;
        if (!w || c.dead || state.over) { state.aiPlan[kind] = null; return; }
        const S = snapshotForSim(w);
        const death = e => lakeKills(lakeAtFeet(w, e), kind);
        const partner = kind === 'fire' ? state.water : state.fire;
        const gem = w.gems.find(g => !g.taken && g.color === kind);
        const ex = w.exits[kind];
        const atOwn = Boolean(ex && entOverTile(c, ex.tx, ex.ty));
        const btnTargets = w.button
            .filter(b => {
                const door = w.doors.find(d => d.id === b.id);
                return door && !door.open && lakeAtFeetIsSafeFor(kind, w, b);
            })
            .map(b => ({ tx: b.tx, ty: b.ty, key: 'btn' + b.id }));
        const targets = [];
        if (atOwn && partner && !partner.atDoor && !partner.dead) targets.push(...btnTargets);
        if (gem) targets.push({ tx: gem.tx, ty: gem.ty, key: 'gem' + gem.tx + ',' + gem.ty });
        if (ex) targets.push({ tx: ex.tx, ty: ex.ty, key: 'exit' });
        targets.push(...btnTargets);
        for (const t of targets) {
            const plan = planRoute(S, c, e => entOverTile(e, t.tx, t.ty), death, 2200);
            if (plan) {
                // _target 必须与 needsReplan 的比对 key 同一语义（宝石/门状态指纹），
                // 否则「去踩钮」这类目标会被 needsReplan 判成目标变了、
                // 每 0.35s 把刚生成的计划整个重置一遍（跳跃动作反复从第一帧重来）。
                plan._target = targetKey(kind);
                state.aiPlan[kind] = plan;
                return;
            }
        }
        const wait = [{ name: 'W', dir: 0, t: 0.5, jump: false }];
        // 等待计划也要挂 _target：不挂的话 needsReplan 每次都判「目标变了」，
        // 每 0.35s 白跑一遍 2200 步 BFS，世界明明没有任何变化。
        wait._target = targetKey(kind);
        state.aiPlan[kind] = wait;
    }

    /** 目标指纹：下一个可拿的同色宝石 + 各门开合状态。任一变化才需要重算计划。 */
    function targetKey(kind) {
        const w = state.w;
        if (!w) return '';
        const gem = w.gems.find(g => !g.taken && g.color === kind);
        return (gem ? 'gem' + gem.tx + ',' + gem.ty : 'exit') + '|' + w.doors.map(d => d.open ? 1 : 0).join('');
    }

    /** 某个钮所在的湖对该角色是否安全（火男孩敢踩火湖钮，水女孩敢踩水湖钮） */
    function lakeAtFeetIsSafeFor(kind, w, tile) {
        const lk = w.lake[tile.ty * w.cols + tile.tx];
        return !lakeKills(lk, kind);
    }

    /* ---------------- 渲染 ---------------- */
    function render() {
        if (!canvas || !state.w) return;
        const w = state.w;
        const cw = w.cols * TILE, ch = w.rows * TILE;
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        const g = ctx2d;
        g.clearRect(0, 0, cw, ch);
        // 背景
        g.fillStyle = '#171a21';
        g.fillRect(0, 0, cw, ch);
        // 湖（画在墙之前，让墙压边）。工坊给这格指定了颜色就用它。
        // 湖:三种液体质感不同 —— 火湖=深红+翻滚气泡;水湖=深蓝+暗波纹;毒泥=墨绿+警示斜纹+冒泡
        for (let y = 0; y < w.rows; y++) for (let x = 0; x < w.cols; x++) {
            const lk = w.lake[y * w.cols + x];
            if (!lk) continue;
            const tint = (w.props[x + ',' + y] || {}).color;
            const px = x * TILE, py = y * TILE;
            const above = y > 0 ? w.lake[(y - 1) * w.cols + x] : 0;
            g.fillStyle = tint || (lk === LAKE_FIRE ? COLORS.lavaDeep : lk === LAKE_WATER ? COLORS.waterDeep : COLORS.gooDeep);
            g.fillRect(px, py, TILE, TILE);
            if (lk === LAKE_GOO) {
                g.save(); g.beginPath(); g.rect(px, py, TILE, TILE); g.clip();
                g.strokeStyle = COLORS.gooStripe; g.lineWidth = 4;
                for (let k = -TILE; k < TILE; k += 12) { g.beginPath(); g.moveTo(px + k, py + TILE); g.lineTo(px + k + TILE, py); g.stroke(); }
                g.restore();
            }
            // 液面:上方不是同种液体才画亮边,并轻微起伏
            if (!above) {
                const wob = Math.sin(state.time * 3 + x * 1.3) * 1.2;
                g.fillStyle = tint || (lk === LAKE_FIRE ? COLORS.lavaTop : lk === LAKE_WATER ? COLORS.waterTop : COLORS.gooTop);
                g.fillRect(px, py + 3 + wob, TILE, 4);
                g.fillStyle = 'rgba(255,255,255,.35)';
                g.fillRect(px + (x % 2 ? 6 : 16), py + 3 + wob, 8, 1.5);
            }
            // 气泡:火湖和毒泥冒泡;水湖画一道暗色波纹
            if (lk === LAKE_FIRE || lk === LAKE_GOO) {
                const ph = (state.time * 0.7 + x * 0.37 + y * 0.21) % 1;
                g.fillStyle = lk === LAKE_FIRE ? COLORS.lavaGlow : COLORS.gooTop;
                g.beginPath(); g.arc(px + TILE * (0.3 + 0.4 * (((x * 7 + y) % 3) / 2)), py + TILE * (0.92 - ph * 0.6), 2.2, 0, Math.PI * 2); g.fill();
            } else if (lk === LAKE_WATER) {
                g.fillStyle = 'rgba(191,233,255,.22)';
                g.fillRect(px, py + TILE * 0.55 + Math.sin(state.time * 2 + x) * 2, TILE, 2);
            }
        }
        // 墙
        for (let y = 0; y < w.rows; y++) for (let x = 0; x < w.cols; x++) {
            if (!w.wall[y * w.cols + x]) continue;
            const tint = (w.props[x + ',' + y] || {}).color;
            g.fillStyle = tint || COLORS.wall;
            g.fillRect(x * TILE, y * TILE, TILE, TILE);
            const aboveIsWall = y > 0 && w.wall[(y - 1) * w.cols + x];
            if (!aboveIsWall && !tint) { g.fillStyle = COLORS.wallTop; g.fillRect(x * TILE, y * TILE, TILE, 5); }
        }
        // 移台行程虚线:看得出它会去哪、走多远
        for (const m of w.movers) {
            g.save();
            g.strokeStyle = 'rgba(255,255,255,.22)';
            g.setLineDash([4, 4]);
            g.lineWidth = 1.5;
            g.beginPath();
            if (m.axis === 'x') {
                const yy = (m.y + m.h / 2) * TILE;
                g.moveTo(m.min * TILE, yy); g.lineTo((m.max + m.w) * TILE, yy);
            } else {
                const xx = (m.x + m.w / 2) * TILE;
                g.moveTo(xx, m.min * TILE); g.lineTo(xx, (m.max + m.h) * TILE);
            }
            g.stroke();
            g.restore();
        }
        // 压力钮:颜色 = 它控制的闸门颜色;按下后变成浅绿并标 ✓
        for (const b of w.button) {
            const px = b.tx * TILE, py = b.ty * TILE;
            g.fillStyle = b.pressed ? COLORS.plateOn : gateColor(b.id);
            rr(g, px + 4, py + TILE - 9, TILE - 8, 7, 3);
            g.fill();
            g.fillStyle = '#fff';
            g.font = 'bold 9px sans-serif';
            g.textAlign = 'center';
            g.fillText(b.pressed ? '✓' : b.id, px + TILE / 2, py + TILE - 12);
            g.textAlign = 'start';
        }
        // 闸门:关着 = 带栅条的实色块;开着 = 只剩虚线轮廓
        for (const d of w.doors) {
            const px = d.tx * TILE, py = d.ty * TILE;
            const col = d.colorTint || gateColor(d.id);
            if (d.open) {
                g.strokeStyle = hexAlpha(col, 0.6);
                g.lineWidth = 1.5;
                g.setLineDash([4, 4]);
                g.strokeRect(px + 5, py + 1, TILE - 10, TILE - 2);
                g.setLineDash([]);
            } else {
                g.fillStyle = col;
                g.fillRect(px + 4, py, TILE - 8, TILE);
                g.fillStyle = 'rgba(0,0,0,.35)';
                for (let k = 0; k < 3; k++) g.fillRect(px + 9 + k * 6, py, 3, TILE);
                g.fillStyle = 'rgba(255,255,255,.35)';
                g.fillRect(px + 4, py, TILE - 8, 2);
            }
        }
        // 出口
        drawExit(w.exits.fire, 'fire');
        drawExit(w.exits.water, 'water');
        // 宝石:圆形 + 脉动 + 高光,和方形的闸门/石头区分
        for (const gem of w.gems) {
            if (gem.taken) continue;
            const cx = gem.tx * TILE + TILE / 2, cy = gem.ty * TILE + TILE / 2;
            const pulse = 1 + Math.sin(state.time * 4 + gem.tx) * 0.08;
            g.beginPath();
            g.arc(cx, cy, 7 * pulse, 0, Math.PI * 2);
            g.fillStyle = gem.colorTint || (gem.color === 'fire' ? COLORS.gemFire : COLORS.gemWater);
            g.fill();
            g.strokeStyle = '#fff';
            g.lineWidth = 1.5;
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,.7)';
            g.beginPath(); g.arc(cx - 2.5, cy - 2.5, 2, 0, Math.PI * 2); g.fill();
        }
        // 石头:圆角灰石 + 裂纹
        for (const r of w.rocks) {
            const px = r.x * TILE, py = r.y * TILE, pw = r.w * TILE, ph = r.h * TILE;
            g.fillStyle = r.colorTint || COLORS.rock;
            rr(g, px + 2, py + 2, pw - 4, ph - 4, 9);
            g.fill();
            g.strokeStyle = COLORS.rockEdge; g.lineWidth = 2; g.stroke();
            if (!r.colorTint) {
                g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5;
                g.beginPath();
                g.moveTo(px + pw * 0.3, py + ph * 0.35);
                g.lineTo(px + pw * 0.5, py + ph * 0.6);
                g.lineTo(px + pw * 0.72, py + ph * 0.4);
                g.stroke();
            }
        }
        // 移台:浅木色 + 斜纹(表示会动)
        for (const m of w.movers) {
            const px = m.x * TILE, py = m.y * TILE, pw = m.w * TILE, ph = m.h * TILE;
            g.save();
            g.beginPath(); g.rect(px, py, pw, ph); g.clip();
            g.fillStyle = m.color || COLORS.mover;
            g.fillRect(px, py, pw, ph);
            g.strokeStyle = COLORS.moverStripe; g.lineWidth = 3;
            for (let k = -ph; k < pw; k += 9) { g.beginPath(); g.moveTo(px + k, py + ph); g.lineTo(px + k + ph, py); g.stroke(); }
            g.restore();
            g.strokeStyle = COLORS.moverEdge; g.lineWidth = 2;
            g.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
        }
        // 工坊自绘：盖在默认外观上面，碰撞不受影响
        drawArtOverlays(w);
        // 角色
        drawChar(state.fire, COLORS.fire, '火', 'fire');
        drawChar(state.water, COLORS.water, '水', 'water');
    }

    /** "#rrggbb" → rgba()。非法颜色原样返回，调用方当普通 CSS 色用。 */
    function hexAlpha(hex, a) {
        const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    const artCache = new Map();
    function artImage(src) {
        let img = artCache.get(src);
        if (img) return img.complete ? img : null;
        img = new Image();
        artCache.set(src, img);
        img.src = src;
        return null;
    }

    /** 把工坊里手绘的格子贴到画面上。石头和移台会跟着实体走，其余贴在原格。 */
    function drawArtOverlays(w) {
        const g = ctx2d;
        const drawn = new Set();
        for (const r of w.rocks) if (r.art) { const img = artImage(r.art); if (img) g.drawImage(img, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE); drawn.add(r.art); }
        for (const m of w.movers) if (m.art) { const img = artImage(m.art); if (img) g.drawImage(img, m.x * TILE, m.y * TILE, m.w * TILE, m.h * TILE); }
        if (!w.props) return;
        Object.keys(w.props).forEach(k => {
            const art = w.props[k].art;
            if (!art) return;
            const img = artImage(art);
            if (!img) return;
            const [x, y] = k.split(',').map(Number);
            const ch = (w.mapRows && w.mapRows[y]) ? w.mapRows[y][x] : '';
            if (ch === 'O' || ch === 'h' || ch === 'v') return;
            g.drawImage(img, x * TILE, y * TILE, TILE, TILE);
        });
    }

    function drawExit(ex, kind) {
        if (!ex) return;
        const g = ctx2d;
        const c = ex.colorTint || (kind === 'fire' ? COLORS.exitFire : COLORS.exitWater);
        const px = ex.tx * TILE, py = ex.ty * TILE;
        const who = kind === 'fire' ? state.fire : state.water;
        const arrived = Boolean(who && who.atDoor);
        // 出口:底色呼吸闪烁 + 大号「火/水」字样,一眼看出属于哪个角色
        g.fillStyle = hexAlpha(c, 0.18 + 0.10 * Math.sin(state.time * 3));
        g.fillRect(px + 3, py + 2, TILE - 6, TILE - 2);
        g.strokeStyle = c;
        g.lineWidth = arrived ? 4 : 3;
        g.strokeRect(px + 3, py + 2, TILE - 6, TILE - 2);
        g.fillStyle = c;
        g.font = 'bold 13px sans-serif';
        g.textAlign = 'center';
        g.fillText(kind === 'fire' ? '火' : '水', px + TILE / 2, py + TILE / 2 + 5);
        g.textAlign = 'start';
        // 角色已到达:白色内框提示
        if (arrived) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(px + 1, py, TILE - 2, TILE); }
    }

    function drawChar(c, color, label, kind) {
        if (!c || c.dead) return;
        const g = ctx2d;
        const x = c.x * TILE, y = c.y * TILE, wpx = c.w * TILE, hpx = c.h * TILE;
        const art = charArt[kind];
        const custom = art ? drawCharArt(art, c, x, y, wpx, hpx) : false;
        if (!custom) {
            g.fillStyle = color;
            g.beginPath();
            g.roundRect ? g.roundRect(x, y, wpx, hpx, 5) : g.rect(x, y, wpx, hpx);
            g.fill();
            // 眼睛（朝向）
            g.fillStyle = '#10131a';
            const ex = x + wpx / 2 + c.facing * 4;
            g.fillRect(ex - 3, y + 7, 3, 4);
            g.fillRect(ex + 2, y + 7, 3, 4);
        }
        // 标签
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.font = '10px sans-serif';
        g.textAlign = 'center';
        g.fillText(label, x + wpx / 2, y - 3);
    }

    /* ---------------- 自定义角色外观（冰火人工坊上传） ----------------
       工坊把用户上传的整图 / 头身分离图 / 行走跳跃帧写进 IndexedDB，
       这里读出来直接画在角色位置上；没上传就继续用默认的色块小人。
       图片只解码一次，帧选择靠 state.time，不额外开定时器。 */
    const CHAR_ART_DB = 'mySWIcefireChars';
    const CHAR_ART_STORE = 'chars';
    let charArt = { fire: null, water: null };

    function charArtDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('浏览器不支持 IndexedDB')); return; }
            const req = indexedDB.open(CHAR_ART_DB, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CHAR_ART_STORE)) db.createObjectStore(CHAR_ART_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('打不开角色外观库'));
        });
    }

    /** 读回两个角色的外观配置，并解码成 Image */
    function loadCharacterArt() {
        return charArtDB().then(db => new Promise(resolve => {
            const store = db.transaction(CHAR_ART_STORE, 'readonly').objectStore(CHAR_ART_STORE);
            const out = {};
            let left = 2;
            const done = () => { if (--left <= 0) resolve(out); };
            ['fire', 'water'].forEach(kind => {
                const req = store.get(kind);
                req.onsuccess = () => { out[kind] = req.result || null; done(); };
                req.onerror = () => { out[kind] = null; done(); };
            });
        })).then(map => {
            charArt = { fire: prepareCharArt(map.fire), water: prepareCharArt(map.water) };
            return charArt;
        }).catch(() => {
            charArt = { fire: null, water: null };
            return charArt;
        });
    }

    function toArtImage(src) {
        if (typeof src !== 'string' || !src) return null;
        const img = new Image();
        img.src = src;
        return img;
    }
    function preparePart(part) {
        if (!part) return null;
        const idle = toArtImage(part.idle);
        const walk = Array.isArray(part.walk) ? part.walk.map(toArtImage).filter(Boolean) : [];
        const jump = toArtImage(part.jump);
        if (!idle && !walk.length && !jump) return null;
        return { idle, walk, jump };
    }
    function prepareCharArt(rec) {
        if (!rec || (rec.mode !== 'single' && rec.mode !== 'split')) return null;
        const art = {
            mode: rec.mode,
            single: preparePart(rec.single),
            head: preparePart(rec.head),
            body: preparePart(rec.body)
        };
        if (!art.single && !art.head && !art.body) return null;
        return art;
    }

    /** 选帧：明确离地→跳跃帧；有明显水平速度→行走帧循环；否则站立帧 */
    function pickArtFrame(part, c) {
        if (!part) return null;
        if (c.onGround === false && part.jump) return part.jump;
        if (Math.abs(Number(c.vx) || 0) > 0.35 && part.walk.length) {
            return part.walk[Math.floor(state.time * 9) % part.walk.length];
        }
        return part.idle || part.walk[0] || part.jump;
    }
    function artReady(img) { return Boolean(img && img.complete && img.naturalWidth > 0); }

    /**
     * 按「底边对齐、按高度缩放、水平居中」把角色图画进碰撞盒。
     * 不按宽度硬缩放：碰撞盒只有 0.62×0.86 格（约 21×29px），
     * 把正常比例的人图压成这个宽度会严重变形，所以以高度为准，
     * 宽度按原图比例溢出（只影响观感，碰撞不受影响）。
     */
    function paintArt(ent, img, cx, bottom, maxH, maxW) {
        if (!artReady(img)) return false;
        const g = ctx2d;
        const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
        let h = maxH, w = h * (nw / nh);
        if (maxW && w > maxW) { w = maxW; h = w * (nh / nw); }
        const top = bottom - h;
        if (ent.facing < 0) {
            g.save();
            g.translate(cx, 0);
            g.scale(-1, 1);
            g.drawImage(img, -w / 2, top, w, h);
            g.restore();
        } else {
            g.drawImage(img, cx - w / 2, top, w, h);
        }
        return true;
    }

    /** 返回 true 表示这一帧用了自定义外观，默认小人就不用再画了 */
    function drawCharArt(art, c, x, y, wpx, hpx) {
        const cx = x + wpx / 2;
        const bottom = y + hpx;
        if (art.mode === 'single' && art.single) {
            return paintArt(c, pickArtFrame(art.single, c), cx, bottom, hpx * 1.05, wpx * 3);
        }
        const body = paintArt(c, pickArtFrame(art.body, c), cx, bottom, hpx, wpx * 2.4);
        // 头画在碰撞盒上沿：底边压在盒顶稍下方，视觉上才和身体连在一起
        const head = paintArt(c, pickArtFrame(art.head, c), cx, y + hpx * 0.94, wpx * 1.5, wpx * 2);
        return body || head;
    }

    /* ---------------- 主循环 ---------------- */
    function loop(ts) {
        if (!state.running) return;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000 || PHYS.dt);
        state.lastTs = ts;
        if (!state.over) {
            state.time += dt;
            // AI 计划按需重算（计划跑完 / 目标变化）
            state.aiTick += dt;
            if (state.aiTick > 0.35) {
                state.aiTick = 0;
                if (needsReplan('fire')) replan('fire');
                if (needsReplan('water')) replan('water');
            }
            worldStep(dt);
        }
        render();
        syncStatus();
        state.raf = requestAnimationFrame(loop);
    }

    function needsReplan(kind) {
        const plan = state.aiPlan[kind];
        if (state.mode === 'solo') return false;
        if (state.mode === 'duo' && state.playerChar === kind) return false;
        if (!plan || !plan.length) return true;
        // 目标指纹（宝石/门状态）变了才重算；指纹与 replan 里写入的同一份
        if (plan._target !== targetKey(kind)) { plan._target = targetKey(kind); return true; }
        return false;
    }

    /* ============================================================
       界面：三栏布局（左聊天 / 中画布 / 右控制），与棋局同一套视觉
 */
    function mount() {
        if (root) return;
        root = document.createElement('section');
        root.id = 'forest-icefire';
        root.innerHTML = `
            <aside class="bg-chat-pane">
                <header><i class="ri-fire-line"></i> <span id="fif-chat-name">森林边</span></header>
                <div id="fif-chat" class="bg-chat" tabindex="0"></div>
                <form id="fif-chat-form">
                    <input id="fif-chat-input" type="text" maxlength="120" placeholder="边玩边聊" autocomplete="off">
                    <button type="submit" aria-label="发送"><i class="ri-send-plane-2-line"></i></button>
                </form>
            </aside>
            <div class="bg-board-pane fif-board-pane">
                <div class="game-focus-bar">
                    <button type="button" id="fif-toggle-chat" title="收起 / 展开左侧聊天栏"><i class="ri-chat-off-line"></i><span>聊天</span></button>
                    <button type="button" id="fif-toggle-side" title="收起 / 展开右侧操作栏"><i class="ri-layout-right-line"></i><span>操作</span></button>
                    <button type="button" id="fif-fullscreen" title="全屏（只留游戏画面）"><i class="ri-fullscreen-line"></i><span>全屏</span></button>
                </div>
                <div class="fif-canvas-scroll"><canvas id="fif-canvas" aria-label="森林冰火人游戏画面"></canvas></div>
                <div class="fif-rotate-gate" id="fif-rotate-gate">
                    <i class="ri-smartphone-line"></i>
                    <b>把手机横过来</b>
                    <p>一格 34 像素、整关最宽 28 格，竖着拿会把关卡的右半边挤在屏幕外。横过来之后画布独占整块屏幕，关卡看得全，按键也好按。</p>
                    <button type="button" id="fif-rotate-go">进入横屏</button>
                    <button type="button" id="fif-rotate-skip">还是竖着玩</button>
                </div>
                <div class="fif-touch" id="fif-touch" hidden>
                    <div class="fif-keys fif-keys-move">
                        <button type="button" class="fif-key" data-act="left" aria-label="向左"><i class="ri-arrow-left-s-line"></i></button>
                        <button type="button" class="fif-key" data-act="right" aria-label="向右"><i class="ri-arrow-right-s-line"></i></button>
                    </div>
                    <button type="button" class="fif-who" id="fif-who" aria-label="切换正在操控的角色">操控 火</button>
                    <button type="button" class="fif-key fif-key-jump" data-act="jump" aria-label="跳"><i class="ri-arrow-up-line"></i><span>跳</span></button>
                </div>
            </div>
            <aside class="bg-side">
                <h3 id="fif-title">森林冰火人</h3>
                <p id="fif-status"></p>
                <div class="bg-size-row" id="fif-mode-row" role="group" aria-label="玩法模式"></div>
                <div class="bg-size-row" id="fif-char-row" role="group" aria-label="你控制谁" hidden></div>
                <div class="bg-size-row" id="fif-level-row" role="group" aria-label="选关"></div>
                <button type="button" id="fif-restart"><i class="ri-refresh-line"></i> 重来本关</button>
                <button type="button" id="fif-hint"><i class="ri-lightbulb-line"></i> 给我指条路</button>
                <button type="button" id="fif-exit"><i class="ri-close-line"></i> 退出</button>
                <div class="fif-legend">
                    <style>#forest-icefire .fif-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}#forest-icefire .fif-legend span{display:block;margin:5px 0;font-size:.8em;line-height:1.5}</style>
                    <b>图例</b>
                    <span><i style='background:#ff6a2a'></i>火湖:只有火男孩能踩,水女孩碰到即死</span>
                    <span><i style='background:#5cc4ff'></i>水湖:只有水女孩能踩,火男孩碰到即死</span>
                    <span><i style='background:#9be85a'></i>绿泥:谁碰都死</span>
                    <span><i style='background:#ffb020'></i>橙闸门 A / <i style='background:#b57bff'></i>紫闸门 B:同色压力钮按下即开</span>
                    <span><i style='background:#c8ffd0'></i>压力钮按下后变浅绿并标 ✓</span>
                    <span><i style='background:#9aa3ad;border-radius:50%'></i>灰石头:可推、会落,能垫脚或填坑</span>
                    <span><i style='background:#c79a4a'></i>斜纹平台:会移动,虚线为行程</span>
                    <span><i style='background:#ff5a3c;border-radius:50%'></i>红宝石=火 / <i style='background:#4fd8ff;border-radius:50%'></i>蓝宝石=水</span>
                    <span><i style='background:#ff7a3c;opacity:.7'></i>橙框=火出口 / <i style='background:#4fb7ff;opacity:.7'></i>蓝框=水出口</span>
                </div>
                <p class="bg-line system">方向键 / 空格 = 火男孩;W A D = 水女孩;R = 重来本关。<br>单人模式一人控俩;双人模式你控一个、AI 控另一个;演示模式看 AI 自己配合通关。</p>
            </aside>`;
        document.getElementById('chat-area')?.appendChild(root);
        canvas = root.querySelector('#fif-canvas');
        ctx2d = canvas.getContext('2d');
        // 重新进入时聊天栏是新建的空 DOM，增量渲染计数必须归零，
        // 否则旧计数会让 state.chat 里已有的消息一条都画不出来。
        renderedChatCount = 0;
        bindDom();
    }

    function unmount() {
        state.running = false;
        cancelAnimationFrame(state.raf);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
        state.keys = {};
        touchHeld.left = touchHeld.right = touchHeld.jump = false;
        root?.remove();
        root = null;
        canvas = null;
        ctx2d = null;
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('orientationchange', onViewportChange);
        document.body.classList.remove('fif-on');
        document.body.classList.remove('fif-full');
    }

    function bindDom() {
        root.querySelector('#fif-restart').addEventListener('click', () => { restartLevel(); });
        root.querySelector('#fif-exit').addEventListener('click', () => { unmount(); });
        root.querySelector('#fif-hint').addEventListener('click', showHint);
        bindFocusBar();
        root.querySelector('#fif-mode-row').addEventListener('click', e => {
            const b = e.target.closest('[data-mode]');
            if (!b) return;
            state.mode = b.dataset.mode;
            state.playerChar = state.mode === 'duo' ? (state.playerChar || 'fire') : null;
            buildModeRow(); buildCharRow(); syncTouchPads();
            state.aiPlan = { fire: null, water: null };
            pushChat('system', modeText());
        });
        root.querySelector('#fif-char-row').addEventListener('click', e => {
            const b = e.target.closest('[data-char]');
            if (!b) return;
            state.playerChar = b.dataset.char;
            buildCharRow(); syncTouchPads();
            state.aiPlan = { fire: null, water: null };
            pushChat('system', `这局你控${state.playerChar === 'fire' ? '火男孩（方向键）' : '水女孩（WASD）'}，另一个交给我。`);
        });
        root.querySelector('#fif-level-row').addEventListener('click', e => {
            const b = e.target.closest('[data-level]');
            if (!b) return;
            loadLevel(Number(b.dataset.level));
            buildLevelRow();
        });
        root.querySelector('#fif-chat-form').addEventListener('submit', e => {
            e.preventDefault();
            const input = root.querySelector('#fif-chat-input');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            pushChat('user', text);
            chatReply(text);
        });
        // 键盘：只在游戏挂载时接管方向键/WASD/空格，避免和聊天输入框抢键
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        // 横竖屏切换 / 窗口尺寸变化时重算“要不要提示横屏”
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('orientationchange', onViewportChange);
        bindTouch();
        applyFocus();
        syncRotateGate();
    }

    /* 手机没有方向键。屏幕上只放一套按键，避免左右各一套时
       把水的跳按成火的。点左下角的角色名在火/水之间切换；
       切换的那一帧把按住的键清掉，不会把上一个角色的跳带给下一个。
       双人模式下玩家只控一个，切换按钮隐藏；演示模式整块隐藏。 */
    const touchHeld = { who: 'fire', left: false, right: false, jump: false };
    function bindTouch() {
        const box = root.querySelector('#fif-touch');
        /* 事件只绑一次：hidden 的元素收不到 pointer 事件，不需要解绑。
           显隐不能像旧版那样只在挂载那一刻判断一次——
           窗口后来从宽变窄（开发者工具、拖小窗口、手机横竖切换）时
           bindTouch 不会重跑，按键永远出不来；而且旧版在窄屏判定失败时
           连监听器都没绑，即使显示出来点了也没反应。
           显隐统一交给 syncTouchVisibility()，resize 时随时重算。 */
        box.querySelectorAll('.fif-key').forEach(btn => {
            const act = btn.dataset.act;
            const down = e => {
                e.preventDefault();
                touchHeld[act] = true;
                btn.classList.add('on');
                try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器没有 capture */ }
            };
            const up = e => {
                if (e && e.pointerId != null && btn.hasPointerCapture && !btn.hasPointerCapture(e.pointerId)) return;
                touchHeld[act] = false;
                btn.classList.remove('on');
            };
            btn.addEventListener('pointerdown', down);
            btn.addEventListener('pointerup', up);
            btn.addEventListener('pointercancel', up);
            btn.addEventListener('lostpointercapture', up);
        });
        box.querySelector('#fif-who').addEventListener('click', () => {
            if (state.mode !== 'solo') return;
            setTouchWho(touchHeld.who === 'fire' ? 'water' : 'fire');
        });
        syncTouchVisibility();
    }
    /** 按当前视口重算触屏键显隐（挂载和 resize 都会走到） */
    function syncTouchVisibility() {
        const box = root?.querySelector('#fif-touch');
        if (!box) return;
        const show = coarsePointer();
        // 从显示变隐藏的那一下，把还按着的键清掉：否则角色会一直朝一个方向走
        if (!show && !box.hidden) {
            touchHeld.left = touchHeld.right = touchHeld.jump = false;
            box.querySelectorAll('.fif-key.on').forEach(b => b.classList.remove('on'));
        }
        box.hidden = !show;
        syncTouchPads();
    }
    /** 切换正在控的角色。按键状态必须清掉：否则按住跳再点切换，
        跳会被带到另一个角色身上。 */
    function setTouchWho(who) {
        touchHeld.who = who === 'water' ? 'water' : 'fire';
        touchHeld.left = touchHeld.right = touchHeld.jump = false;
        root?.querySelectorAll('.fif-key.on').forEach(b => b.classList.remove('on'));
        syncTouchPads();
    }
    function syncTouchPads() {
        const box = root?.querySelector('#fif-touch');
        if (!box || box.hidden) return;
        const whoBtn = box.querySelector('#fif-who');
        const keys = box.querySelectorAll('.fif-keys, .fif-key-jump');
        if (state.mode === 'demo') {
            keys.forEach(k => { k.hidden = true; });
            whoBtn.hidden = true;
            return;
        }
        keys.forEach(k => { k.hidden = false; });
        const who = state.mode === 'duo' ? (state.playerChar || 'fire') : touchHeld.who;
        if (state.mode === 'duo') touchHeld.who = who;
        whoBtn.hidden = state.mode !== 'solo';
        whoBtn.textContent = who === 'fire' ? '正在控 火 · 点此换水' : '正在控 水 · 点此换火';
        whoBtn.dataset.who = who;
        // 按键整块跟着当前角色变色（CSS 里的 .fif-touch[data-who] 规则）
        box.dataset.who = who;
    }
    function touchOf(pad) {
        if (touchHeld.who !== pad) return { left: false, right: false, jump: false };
        return { left: touchHeld.left, right: touchHeld.right, jump: touchHeld.jump };
    }

    function onKey(e) {
        if (!root) return;
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        // R 随时重来本关,不用伸手去点右侧按钮
        if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!e.repeat) restartLevel();
            return;
        }
        if (KEYMAP[e.code]) {
            // 这局已经结束（通关/有人倒下）时世界冻结、按键毫无反应，像卡死。
            // 第一次按给一句提示告诉玩家怎么重开，之后 4 秒内不重复刷屏。
            if (state.over && !state.keys[e.code]) {
                const now = performance.now();
                if (!state.overHintAt || now - state.overHintAt > 4000) {
                    state.overHintAt = now;
                    pushChat('system', state.win
                        ? '这局已经通关了,按 R 或点右侧「重来本关」开新的一局。'
                        : '有人倒下了,按 R 或点右侧「重来本关」再试一次。');
                }
            }
            state.keys[e.code] = true;
            e.preventDefault();
        }
    }
    function onKeyUp(e) {
        if (KEYMAP[e.code]) state.keys[e.code] = false;
    }
    const KEYMAP = {
        ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, Space: 1,
        KeyA: 1, KeyD: 1, KeyW: 1
    };

    function modeText() {
        if (state.mode === 'solo') return '单人模式：你一个人控两个角色（方向键 + WASD）。';
        if (state.mode === 'demo') return '演示模式：两个角色都由 AI 规划操作，你可以边看边和它聊天。';
        return `双人模式：你控${state.playerChar === 'fire' ? '火男孩' : '水女孩'}，另一个由 AI 操作。`;
    }

    function buildModeRow() {
        const row = root.querySelector('#fif-mode-row');
        row.innerHTML = '<span>玩法</span>' + [
            ['solo', '单人控俩'], ['duo', '你和AI'], ['demo', 'AI演示']
        ].map(([v, label]) => `<button type="button" data-mode="${v}" class="${state.mode === v ? 'on' : ''}">${label}</button>`).join('');
    }
    function buildCharRow() {
        const row = root.querySelector('#fif-char-row');
        row.hidden = state.mode !== 'duo';
        if (row.hidden) return;
        row.innerHTML = '<span>你控</span>' + [
            ['fire', '火男孩'], ['water', '水女孩']
        ].map(([v, label]) => `<button type="button" data-char="${v}" class="${state.playerChar === v ? 'on' : ''}">${label}</button>`).join('');
    }
    function buildLevelRow() {
        const row = root.querySelector('#fif-level-row');
        const list = allLevels();
        // 内置关显示序号，工坊关显示关卡名（太长截断），点上去有 title 看全名
        row.innerHTML = '<span>关卡</span>' + list.map((lv, i) => {
            const custom = i >= LEVELS.length;
            const label = custom ? String(lv.name || ('工坊' + (i - LEVELS.length + 1))).slice(0, 8) : String(i + 1);
            const title = String(lv.name || '').replace(/"/g, '');
            return `<button type="button" data-level="${i}" class="${state.levelIndex === i ? 'on' : ''}${custom ? ' fif-custom' : ''}" title="${title}">${label}</button>`;
        }).join('');
    }

    function syncSide() {
        if (!root) return;
        buildModeRow(); buildCharRow(); buildLevelRow();
        const name = root.querySelector('#fif-chat-name');
        const f = currentFriend();
        if (name) name.textContent = f ? `和 ${f.name} 一起` : '森林边';
        syncStatus();
    }

    function syncStatus() {
        if (!root) return;
        const el = root.querySelector('#fif-status');
        if (!el) return;
        const w = state.w;
        if (!w) return;
        // 门是多格高的门柱（同一 id 占多格），按 id 去重后显示，
        // 否则第三关会出现「B:关 A:关 B:关 A:关 B:关 A:关」这样一长串重复
        const doorState = {};
        w.doors.forEach(d => { doorState[d.id] = d.open ? '开' : '关'; });
        const doors = Object.keys(doorState).sort().map(id => `${id}:${doorState[id]}`).join(' ');
        el.textContent = state.over
            ? (state.win ? `🎉 通关!${state.time.toFixed(1)}s · 宝石 ${state.gemsTaken}/${state.gemsTotal}` : '💀 有人倒下了,按 R 或点「重来本关」')
            : `${w.name} · ${state.time.toFixed(0)}s · 宝石 ${state.gemsTaken}/${state.gemsTotal}${w.doors.length ? ' · 闸门 ' + doors : ''}`;
    }

    /* ---------------- 侧栏聊天（人设台词） ---------------- */
    let renderedChatCount = 0;
    function pushChat(role, text) {
        const value = String(text || '').trim();
        if (!value) return;
        state.chat.push({ role, text: value });
        if (state.chat.length > 60) {
            state.chat.shift();
            renderedChatCount = Math.max(0, renderedChatCount - 1);
            root?.querySelector('#fif-chat')?.firstElementChild?.remove();
        }
        renderChat();
    }
    function renderChat() {
        const box = root?.querySelector('#fif-chat');
        if (!box) return;
        for (let i = renderedChatCount; i < state.chat.length; i++) {
            const m = state.chat[i];
            const div = document.createElement('div');
            div.className = 'bg-line ' + (m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'ai');
            div.textContent = m.text;
            box.appendChild(div);
        }
        renderedChatCount = state.chat.length;
        box.scrollTop = box.scrollHeight;
    }

    /* 内置兜底台词：模型不可用时按场景随机挑一句，保证「AI 在陪玩」的体感不掉线 */
    const CANNED = {
        greet: ['火和水不能碰面，但我们可以碰头商量路线。', '宝石归各自，命归两个人——别把我推进湖里。', '我走我的门，你走你的门，中间那滩泥谁也别踩。'],
        button: ['我去踩钮，你等着门开。', '钮在我这边的湖里，只有我敢下去，交给我。', '踩住了！门开了，快走。'],
        rock: ['把石头推下去，泥坑就有桥了。', '石头垫脚，高台上的宝石才够得着。', '我来推石头，你站边上别被压到。'],
        gem: ['那颗宝石是我的颜色，我绕过去拿。', '宝石在高台上，等我垫个石头。', '拿到一颗！还差几颗看缘分。'],
        warn: ['别踩绿泥！那个谁都救不了。', '你那边是火湖，我过不去，别指望我踩钮。', '门还没开，先去找钮。'],
        win: ['配合得不错，下次我还想和你一组。', '通关了。宝石没拿全的那部分，算留给下一局。', '火与水各归其门——完美的结局。'],
        lose: ['……我说过别踩那个的。', '重来重来，这次我先踩钮。', '失误失误，泥太滑了。'],
        chat: ['嗯嗯，先看看地图再聊。', '你说的对，但门不会自己开。', '聊天可以，别聊到我掉湖里。']
    };
    function canned(kind) {
        const list = CANNED[kind] || CANNED.chat;
        return list[Math.floor(Math.random() * list.length)];
    }

    /** 让大模型用人设说一句（不参与操作决策）；失败静默兜底 */
    async function aiSay(scene, extra) {
        const friend = currentFriend();
        if (!friend) { pushChat('ai', canned(scene)); return; }
        let system = [
            `你正在和玩家一起玩《森林冰火人》。你的人设：${(friend.systemPrompt || friend.name || '').slice(0, 600)}`,
            '当前场景：' + scene + (extra ? '（' + extra + '）' : ''),
            '只输出一句不超过 30 字、符合人设的口语台词，不要解释、不要 Markdown、不要引号。'
        ].join('\n');
        // AI 英文模式：小游戏台词也说英文（english-mode.js）
        try { if (window.EnglishMode) system = window.EnglishMode.applyToSystem(system, 'games'); } catch (e) { /* 注入失败保持中文 */ }
        try {
            const text = await ApiModule.requestSmallTask(settings(), system, '说一句话。', {
                maxTokens: 80, temperature: 0.9, label: '森林冰火人'
            });
            const line = String(text || '').trim().replace(/^["'“”]|["'“”]$/g, '').slice(0, 60);
            pushChat('ai', line || canned(scene));
        } catch (e) {
            pushChat('ai', canned(scene));
        }
    }
    function aiSayWin() { aiSay('win', `用时${state.time.toFixed(1)}秒，宝石${state.gemsTaken}/${state.gemsTotal}`); }

    function chatReply(text) {
        // 玩家说话：模型回一句人设台词；模型不可用就兜底
        aiSay('chat', '玩家说：' + text.slice(0, 80));
    }

    /* 「给我指条路」：用 BFS 给**玩家当前控制的角色**算一条到下一个目标的路，
       在画面上画 1.2 秒的虚线箭头。单人模式下给火男孩算。 */
    let hintPath = null, hintUntil = 0;
    function showHint() {
        const w = state.w;
        if (!w || state.over) return;
        const kind = state.mode === 'duo' ? state.playerChar : 'fire';
        const c = kind === 'fire' ? state.fire : state.water;
        const S = snapshotForSim(w);
        const gem = w.gems.find(g => !g.taken && g.color === kind);
        const target = gem ? { tx: gem.tx, ty: gem.ty } : w.exits[kind];
        const plan = planRoute(S, c, e => entOverTile(e, target.tx, target.ty), e => lakeKills(lakeAtFeet(w, e), kind), 2200);
        if (!plan) {
            pushChat('system', gem ? '暂时算不出拿宝石的安全路线——也许要先开某扇门或垫石头。' : '暂时算不出到出口的安全路线——门可能还没开，去找压力钮。');
            aiSay('warn');
            return;
        }
        // 把计划回放成坐标点
        hintPath = simulatePlanPath(S, c, plan);
        hintUntil = performance.now() + 1600;
        pushChat('system', gem ? `路线已画出来：先去拿${gem.color === 'fire' ? '火' : '水'}宝石。` : '路线已画出来：直奔出口。');
    }

    function simulatePlanPath(S, ent, plan) {
        const pts = [{ x: ent.x + ent.w / 2, y: ent.y + ent.h / 2 }];
        const e = { x: ent.x, y: ent.y, vx: ent.vx, vy: ent.vy, w: ent.w, h: ent.h, onGround: ent.onGround, facing: ent.facing };
        for (const act of plan) {
            const steps = Math.round(act.t / PHYS.dt);
            const input = { left: act.dir < 0, right: act.dir > 0, jump: act.jump };
            for (let i = 0; i < steps; i++) {
                stepEntity(S, e, { left: input.left, right: input.right, jump: act.jump && i === 0 }, PHYS.dt);
            }
            pts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
        }
        return pts;
    }

    /* 把提示路径叠画到主渲染之后 */
    const _render = render;
    render = function () {
        _render();
        if (hintPath && performance.now() < hintUntil && ctx2d) {
            const g = ctx2d;
            g.save();
            g.strokeStyle = 'rgba(255,255,255,.8)';
            g.lineWidth = 2;
            g.setLineDash([6, 6]);
            g.beginPath();
            hintPath.forEach((p, i) => {
                const x = p.x * TILE, y = p.y * TILE;
                if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            });
            g.stroke();
            g.restore();
        } else if (hintPath && performance.now() >= hintUntil) {
            hintPath = null;
        }
    };

    /* ---------------- 专注模式：收起两栏 / 全屏 / 竖屏提示 ----------------
       手机上横屏可用宽度就那么点（一格 34px、整关 24~28 格），左右两栏一占，
       画布只剩中间一条。所以：
         · 点「聊天」「操作」可单独收起任一栏，点「全屏」两栏一起让位；
         · 手机第一次进来默认就收起两栏；
         · 竖屏时先弹一层提示，让人横过来再玩（可跳过）。 */

    const FOCUS_KEY = 'gameFocusState';
    let focus = { hideChat: false, hideSide: false, full: false };
    let rotateSkipped = false;

    function coarsePointer() {
        return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
    }

    /** 第一次进来时手机默认收起两栏；之后完全按用户上次的选择 */
    function loadFocus() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null'); } catch (e) { raw = null; }
        if (raw && typeof raw === 'object') {
            focus.hideChat = raw.hideChat === true;
            focus.hideSide = raw.hideSide === true;
            focus.full = raw.full === true;
            return;
        }
        const phone = coarsePointer();
        focus.hideChat = phone;
        focus.hideSide = phone;
        focus.full = false;
    }
    function saveFocus() {
        try { localStorage.setItem(FOCUS_KEY, JSON.stringify(focus)); } catch (e) { /* 存不下不影响这一局 */ }
    }

    function markFocusBtn(sel, on) {
        const btn = root?.querySelector(sel);
        if (btn) btn.classList.toggle('on', on);
    }
    function applyFocus() {
        if (!root) return;
        const full = focus.full;
        // 全屏时两栏强制隐藏；退出全屏再按用户之前的收起状态恢复
        root.classList.toggle('hide-chat', focus.hideChat && !full);
        root.classList.toggle('hide-side', focus.hideSide && !full);
        root.classList.toggle('game-full', full);
        document.body.classList.toggle('fif-full', full);
        markFocusBtn('#fif-toggle-chat', focus.hideChat);
        markFocusBtn('#fif-toggle-side', focus.hideSide);
        markFocusBtn('#fif-fullscreen', full);
        // 图标与提示跟着状态走，免得状态不明（点了不知道能不能回去）
        const fullBtn = root.querySelector('#fif-fullscreen');
        if (fullBtn) {
            const icon = fullBtn.querySelector('i');
            if (icon) icon.className = full ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line';
            fullBtn.title = full ? '退出全屏（找回左右两栏）' : '全屏（只留游戏画面）';
        }
    }

    /** 竖屏手机：先提示横过来（整关 24~28 格，竖着拿右半边必然在屏幕外） */
    function syncRotateGate() {
        const gate = root?.querySelector('#fif-rotate-gate');
        if (!gate) return;
        const portrait = window.matchMedia('(orientation: portrait)').matches;
        gate.classList.toggle('show', coarsePointer() && portrait && !rotateSkipped);
    }
    function onViewportChange() {
        syncRotateGate();
        // 窗口跨过手机/桌面分界线时，触屏键的显隐要跟着重算
        syncTouchVisibility();
    }

    function bindFocusBar() {
        const chatBtn = root.querySelector('#fif-toggle-chat');
        if (chatBtn) chatBtn.addEventListener('click', () => {
            focus.full = false;
            focus.hideChat = !focus.hideChat;
            saveFocus(); applyFocus();
        });
        const sideBtn = root.querySelector('#fif-toggle-side');
        if (sideBtn) sideBtn.addEventListener('click', () => {
            focus.full = false;
            focus.hideSide = !focus.hideSide;
            saveFocus(); applyFocus();
        });
        const fullBtn = root.querySelector('#fif-fullscreen');
        if (fullBtn) fullBtn.addEventListener('click', () => {
            focus.full = !focus.full;
            saveFocus(); applyFocus();
        });
        const skipBtn = root.querySelector('#fif-rotate-skip');
        if (skipBtn) skipBtn.addEventListener('click', () => { rotateSkipped = true; syncRotateGate(); });
        const goBtn = root.querySelector('#fif-rotate-go');
        if (goBtn) goBtn.addEventListener('click', requestLandscape);
    }

    /** 一键横屏：先全屏（多数浏览器只在全屏下允许锁定方向），再试锁横屏；
        锁不上也不纠缠，直接收起提示，让用户自己把手机转过来。 */
    function requestLandscape() {
        const el = document.documentElement;
        const lock = () => {
            try {
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            } catch (e) { /* 不支持就算了 */ }
        };
        let p = null;
        try { p = el.requestFullscreen ? el.requestFullscreen() : null; } catch (e) { p = null; }
        const after = () => { lock(); rotateSkipped = true; syncRotateGate(); };
        if (p && typeof p.then === 'function') p.then(after).catch(after);
        else after();
    }

    /* ---------------- 入口 ---------------- */
    function open() {
        const friend = currentFriend();
        if (!friend) {
            window.Dlg?.alert ? window.Dlg.alert({ title: '森林冰火人', message: '先打开一个角色再进来玩（群聊不行，这游戏只认一个搭档）。' }) : alert('先打开一个角色再进来玩。');
            return;
        }
        mount();
        document.body.classList.add('fif-on');
        loadFocus();
        applyFocus();
        syncRotateGate();
        if (!state.w) loadLevel(0);
        state.running = true;
        state.lastTs = performance.now();
        cancelAnimationFrame(state.raf);
        state.raf = requestAnimationFrame(loop);
        pushChat('ai', canned('greet'));
        aiSay('greet');
    }

    /* 创意工坊（icefire-workshop.js，同样默认不加载）通过这些方法挂进来：
       registerLevels 把自制关卡追加到内置三关之后，选关条会一起列出；
       refreshLevelRow 在工坊面板改了关卡后即时重绘选关条（游戏开着时）。 */
    const levelProviders = [];
    function allLevels() {
        const extra = [];
        for (const p of levelProviders) {
            try {
                const list = p();
                if (Array.isArray(list)) extra.push(...list.filter(lv => lv && Array.isArray(lv.map) && lv.map.length));
            } catch (e) { /* 工坊脚本坏了不影响内置关卡 */ }
        }
        return LEVELS.concat(extra);
    }
    function refreshLevelRow() {
        if (root) buildLevelRow();
    }
    window.ForestIcefire = {
        open, exit: unmount, isRunning: () => state.running,
        registerLevels(provider) { if (typeof provider === 'function') levelProviders.push(provider); refreshLevelRow(); },
        refreshLevelRow,
        // 工坊上传/清除角色外观后调用，立刻重新读一遍并生效
        refreshCharacterArt: loadCharacterArt,
        parseLevel, makeChar, allLevels
    };

    // 启动时先把已保存的自定义角色外观解好（没上传过就是空）
    loadCharacterArt();

    function bindEntry() {
        document.getElementById('open-icefire-btn')?.addEventListener('click', open);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
    else bindEntry();
})();
