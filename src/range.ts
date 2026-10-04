import { parseBodyStr } from "./body";
import { getRange, randomStr, GET_STRONGHOLD_ROOM } from "./utils";

interface RangeMemory {
  id: string;
  creepName: string;
}

const RANGEMAX = 24;
const STARTTIME = Game.time;
const AFTER = 500;

/**
 * 运行所有的蓝球
 */
export const runRanges = () => {
  if (!Memory.ranges) {
    Memory.ranges = {};
  }

  const rangeMemorys = Object.values(Memory.ranges);
  rangeMemorys.forEach(runRange);

  const targetRoom = Game.rooms[GET_STRONGHOLD_ROOM()];
  if (targetRoom) {
    updateFlags(targetRoom, rangeMemorys);
  }

  spawnRange();
};

/**
 * 运行蓝球
 */
export const runRange = (rangeMemory: RangeMemory) => {
  if (!rangeMemory.creepName) return;
  const creep = Game.creeps[rangeMemory.creepName];
  const flag = Game.flags[rangeMemory.id];
  const targetRoom = Game.rooms[GET_STRONGHOLD_ROOM()];
  const myRoom = Object.values(Game.rooms).filter((room) => room.controller?.my)[0];
  if (!creep) {
    delete Memory.ranges[rangeMemory.id];
    if (flag) {
      flag.remove();
      delete Memory.flags[flag.name];
    }
    return;
  }

  rangeAttack(creep);

  if (!targetRoom) return;

  // 没有旗帜创建旗帜
  if (!flag) {
    myRoom.createFlag(35, 35, rangeMemory.id);
    return;
  }

  rangeMove(creep, flag.pos);
};

/**
 * 蓝球攻击
 */
const rangeAttack = (creep: Creep) => {
  const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
  const structures = creep.room.find(FIND_HOSTILE_STRUCTURES);
  const targets = [...hostiles, ...structures];
  const targetPos = creep.pos.findClosestByRange(targets);

  // 如果够得着中间的核心直接打
  if (creep.pos.getRangeTo(25, 25) <= 3) {
    const core = structures.find((s) => s.pos.x === 25 && s.pos.y === 25);
    if (core) {
      creep.rangedAttack(core);
      return;
    }
  }

  if (!targetPos || creep.pos.getRangeTo(targetPos) <= 1) {
    creep.rangedMassAttack();
    return;
  }

  // 有2个在2格范围的建筑就 mass
  const inrange = structures.filter(
    (t) => t.structureType === STRUCTURE_RAMPART && t.pos.getRangeTo(creep.pos) <= 2,
  );
  if (inrange.length >= 2) {
    creep.rangedMassAttack();
    return;
  }
  const target = targets.find((t) => t.pos.isEqualTo(targetPos))!;
  creep.rangedAttack(target);
};

/**
 * 蓝球移动
 */
const rangeMove = (creep: Creep, targetPos: RoomPosition) => {
  if (!creep || creep.pos.isEqualTo(targetPos)) {
    return;
  }

  const result = PathFinder.search(creep.pos, targetPos, {
    roomCallback(roomName) {
      const costs = new PathFinder.CostMatrix();
      const room = Game.rooms[roomName];

      // 非 road、container 之外的建筑不能走
      const structures = room
        .find(FIND_STRUCTURES)
        .filter(
          (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER,
        );
      if (roomName === GET_STRONGHOLD_ROOM()) {
        if (Game.time >= STARTTIME + AFTER) {
          structures.forEach(({ pos }) => {
            for (let x = pos.x - 1; x <= pos.x + 1; x++) {
              for (let y = pos.y - 1; y <= pos.y + 1; y++) {
                costs.set(x, y, 0xff);
              }
            }
          });
        } else {
          structures.forEach(({ pos }) => {
            costs.set(pos.x, pos.y, 0xff);
          });
        }
      } else {
        structures.forEach(({ pos }) => {
          costs.set(pos.x, pos.y, 0xff);
        });
      }

      // 考虑除自己小队之外的爬的阻挡
      const otherCreeps = room.find(FIND_CREEPS).filter((c) => c.id !== creep.id);
      [...otherCreeps, ...structures].forEach(({ pos }) => {
        costs.set(pos.x, pos.y, 0xff);
      });

      if (roomName === GET_STRONGHOLD_ROOM()) {
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y <= 22; y++) {
            costs.set(x, y, 0xff);
          }
        }
      }

      return costs;
    },
  });

  if (!result.path.length) {
    return;
  }

  const direction = creep.pos.getDirectionTo(result.path.shift()!);
  creep.move(direction);
  return true;
};

/**
 * 孵化蓝球
 */
const spawnRange = () => {
  const teamMemorys = Object.values(Memory.teams);
  if (teamMemorys.length < 2 || teamMemorys.find((m) => m.creepNames.length < 4)) return;

  const rangeMemorys = Object.values(Memory.ranges);

  const freeSpawn = Object.values(Game.spawns).filter((spawn) => !spawn.spawning)?.[0];
  if (!freeSpawn) return;
  const m = rangeMemorys.find((m) => {
    if (m.creepName) return;

    const body = parseBodyStr("r40m10");
    const creepName = randomStr();
    const result = freeSpawn.spawnCreep(body, creepName);
    if (result === OK) {
      m.creepName = creepName;
    }
    return true;
  });

  if (!m && rangeMemorys.length < RANGEMAX) {
    const id = randomStr();
    Memory.ranges[id] = {
      id,
      creepName: "",
    };
  }
};

/**
 * 更新旗帜位置
 */
const updateFlags = (room: Room, rangeMemorys: RangeMemory[]) => {
  const structures = room
    .find(FIND_HOSTILE_STRUCTURES)
    .filter((s) => s.structureType === STRUCTURE_RAMPART);
  let safePoses = getSafePoses(room, structures);
  const safePosSet = new Set(safePoses.map(([x, y]) => `${x}/${y}`));

  // 找离旗帜最近的可用安全位置
  const flags = rangeMemorys
    .map((m) => Game.flags[m.id])
    .filter((f) => {
      if (!f) return false;
      const posStr = `${f.pos.x}/${f.pos.y}`;
      if (safePosSet.has(posStr)) {
        safePosSet.delete(posStr);
        return false;
      }
      return true;
    });

  safePoses = [...safePosSet].map((str) => str.split("/").map((n) => +n)) as [number, number][];
  const has = new Set<string>();
  flags.forEach((flag) => {
    let pos = safePoses[0];
    let dis = Infinity;
    for (const p of safePoses) {
      if (has.has(`${p[0]}/${[1]}`)) continue;
      const newDis = getRange(flag.pos.x, flag.pos.y, p[0], p[1]);
      if (newDis < dis) {
        dis = newDis;
        pos = p;
      }
    }
    if (dis < Infinity) {
      flag.setPosition(new RoomPosition(pos[0], pos[1], room.name));
      has.add(`${pos[0]}/${pos[1]}`);
    }
  });
};

/**
 * 获取可进攻的安全点位
 */
const getSafePoses = (room: Room, structures: Structure[]) => {
  if (room._safePoses) return room._safePoses;

  const structurePosSet = new Set(structures.map(({ pos }) => `${pos.x}/${pos.y}`));
  const visited = new Set<string>();
  const firstBlank: [number, number][] = [];
  const result = new Set<string>();
  const queue: [number, number][] = [];
  queue.push([25, 25]);
  while (queue.length) {
    const pos = queue.shift()!;
    const posStr = `${pos[0]}/${pos[1]}`;
    visited.add(posStr);
    // 当前点是否有建筑
    const hasStructure = structurePosSet.has(posStr);

    for (let x = pos[0] - 1; x <= pos[0] + 1; x++) {
      for (let y = pos[1] - 1; y <= pos[1] + 1; y++) {
        if (!visited.has(`${x}/${y}`)) {
          if (hasStructure) {
            queue.push([x, y]);
            firstBlank.push([x, y]);
          } else {
            result.add(`${x}/${y}`);
          }
        }
      }
    }
  }

  if (Game.time >= STARTTIME + AFTER) {
    firstBlank.forEach(([x, y]) => {
      result.delete(`${x}/${y}`);
    });

    room._safePoses = [...result.values()]
      .map((posStr) => posStr.split("/").map((n) => +n))
      .filter(([, y]) => y >= 23) as [number, number][];
    return room._safePoses.sort((a, b) => a[0] - b[0]);
  }

  // 获取一个位置上下左右的建筑数
  const getNearStructure = (pos: [number, number]) => {
    const x = pos[0];
    const y = pos[1];
    const a = `${x - 1}/${y}`;
    const b = `${x + 1}/${y}`;
    const c = `${x}/${y - 1}`;
    const d = `${x}/${y + 1}`;
    return (
      +structurePosSet.has(a) +
      +structurePosSet.has(b) +
      +structurePosSet.has(c) +
      +structurePosSet.has(d)
    );
  };

  return firstBlank
    .filter((s) => !structurePosSet.has(`${s[0]}/${s[1]}`) && getNearStructure(s) < 2)
    .filter(([, y]) => y >= 23);
};

declare global {
  interface Memory {
    ranges: Record<string, RangeMemory>;
  }

  interface Room {
    _safePoses: [number, number][];
  }
}
