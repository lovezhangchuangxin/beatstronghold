import { parseBodyStr } from "./body";
import { getClosestPos, getRange, randomStr, GET_STRONGHOLD_ROOM } from "./utils";

/**
 * 小队记忆
 */
interface TeamMemory {
  id: string;
  /** 爬名 */
  creepNames: string[];
  /** 状态 */
  status: "spawn" | "ready";
}

const TEAMMAX = 2;

/**
 * 运行所有的小队逻辑
 */
export const runTeams = () => {
  if (!Memory.teams) {
    Memory.teams = {};
  }

  const teamMemorys = Object.values(Memory.teams);
  teamMemorys.forEach(runTeam);

  spawnTeam();
};

/**
 * 运行小队逻辑
 */
export const runTeam = (teamMemory: TeamMemory) => {
  const creeps = teamMemory.creepNames
    .map((creepName) => Game.creeps[creepName])
    .filter((creep) => !!creep);
  const flag = Game.flags[teamMemory.id];

  // 清理小队，小队只要一个人死了，就全队自杀，清理记忆和旗帜
  if (creeps.length !== teamMemory.creepNames.length) {
    creeps.forEach((creep) => creep.suicide());
    delete Memory.teams[teamMemory.id];
    if (flag) {
      flag.remove();
      delete Memory.flags[flag.name];
    }
    return;
  }

  teamHeal(creeps);
  teamAttack(creeps);

  const myRoom = Object.values(Game.rooms).filter((room) => room.controller?.my)[0];
  // 没有旗帜则创建旗帜并移动到目标房间位置
  if (!flag) {
    // const pos = findFreePos();
    const pos = [4, 25];
    if (pos && !Game._freeFlagPos) {
      myRoom.createFlag(45, 25, teamMemory.id);
      Memory.flags[teamMemory.id] = { _setPosition: [pos[0], pos[1], GET_STRONGHOLD_ROOM()] };
      Game._freeFlagPos = true;
    }
    return;
  }

  // 各自移动到旗帜位置集合，然后状态改为ready
  if (!teamMemory.status || teamMemory.status === "spawn") {
    const poses = getCreepsPos(flag.pos);
    let count = 0;
    creeps.forEach((creep, index) => {
      const targetPos = poses[index];
      if (creep.pos.isEqualTo(targetPos)) {
        count++;
        return;
      }
      creep.moveTo(targetPos);
    });
    if (count >= 4) {
      teamMemory.status = "ready";
    }
    return;
  }

  if (changePos(creeps)) return;

  // 以队长为首，如果队长不在旗帜位置则全体朝旗帜位置移动
  if (!teamMove(creeps, flag.pos)) {
    const targetRoom = creeps[0]?.room;
    if (targetRoom && !targetRoom._updatedFlag) {
      updateFlags(targetRoom, flag);
    }

    // 周围没有红球
    // const origin = getOriginCreep(creeps);
    // const hostiles = origin.room.find(FIND_HOSTILE_CREEPS);
    // const attackers = hostiles.filter((creep) => creep.body.find((part) => part.type === ATTACK));
    // const rangers = hostiles.filter((creep) =>
    //   creep.body.find((part) => part.type === RANGED_ATTACK),
    // );
    // const isDanger =
    //   attackers.find((h) => h.pos.getRangeTo(origin.pos) <= 3) ||
    //   rangers.filter((r) => r.pos.getRangeTo(origin.pos) <= 4).length >= 3 ||
    //   creeps.find((creep) => creep.hits < creep.hitsMax);

    // if (!isDanger && origin.pos.isEqualTo(flag.pos)) {
    //   if (origin.pos.x < 25) {
    //     creeps.forEach((creep) => creep.move(BOTTOM_RIGHT));
    //   } else {
    //     creeps.forEach((creep) => creep.move(BOTTOM_LEFT));
    //   }
    // }
  }
};

/**
 * 小队移动
 * @returns 是否移动了
 */
const teamMove = (creeps: Creep[], targetPos: RoomPosition) => {
  const origin = getOriginCreep(creeps);
  if (!origin || origin.pos.isEqualTo(targetPos)) {
    return;
  }

  if (creeps.find((creep) => creep.fatigue > 0)) return true;

  const result = PathFinder.search(origin.pos, targetPos, {
    roomCallback(roomName) {
      const costs = new PathFinder.CostMatrix();
      const room = Game.rooms[roomName];

      // 非 road、container 之外的建筑不能走
      const structures = room
        .find(FIND_STRUCTURES)
        .filter(
          (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER,
        );
      structures.forEach(({ pos }) => {
        for (let x = pos.x - 3; x <= pos.x + 2; x++) {
          for (let y = pos.y - 3; y <= pos.y + 2; y++) {
            costs.set(x, y, 0xf0);
          }
        }
      });
      // 考虑除自己小队之外的爬的阻挡
      const otherCreeps = room
        .find(FIND_CREEPS)
        .filter((c) => !creeps.find((creep) => creep.id === c.id));
      [...otherCreeps, ...structures].forEach(({ pos }) => {
        costs.set(pos.x, pos.y, 0xff);
      });

      for (let x = 0; x < 49; x++) {
        for (let y = 0; y < 49; y++) {
          // 不能出房间
          if (x == 0 || y == 0 || y == 48 || x == 48) {
            costs.set(x, y, 0xff);
          }

          const c = Math.max(
            costs.get(x, y),
            costs.get(x + 1, y),
            costs.get(x, y + 1),
            costs.get(x + 1, y + 1),
          );
          costs.set(x, y, c);
        }
      }

      return costs;
    },
    maxRooms: 1,
  });

  if (!result.path.length) {
    return;
  }

  const direction = origin.pos.getDirectionTo(result.path.shift()!);
  creeps.forEach((creep) => creep.move(direction));
  return true;
};

/**
 * 孵化小队
 */
const spawnTeam = () => {
  const teamMemorys = Object.values(Memory.teams);
  const freeSpawns = Object.values(Game.spawns).filter((spawn) => !spawn.spawning);
  let incomplete = false;
  teamMemorys.forEach((teamMemory) => {
    if (teamMemory.creepNames.length >= 4) return;
    incomplete = true;
    if (!freeSpawns.length) return;

    const spawn = freeSpawns.pop();
    const bodyStr = getBody(teamMemory.creepNames.length);
    const creepName = randomStr();
    const result = spawn?.spawnCreep(parseBodyStr(bodyStr), creepName);
    if (result === OK) {
      teamMemory.creepNames.push(creepName);
    }
  });

  // 还有空闲spawn，继续创建小队
  if (freeSpawns.length && teamMemorys.length < TEAMMAX && !incomplete && Game.time % 3 === 0) {
    const id = randomStr();
    Memory.teams[id] = {
      id,
      creepNames: [],
      status: "spawn",
    };
  }
};

/**
 * 寻找空闲的位置插旗
 */
const findFreePos = () => {
  const allFlagsPos = Object.values(Game.flags).map((flag) => `${flag.pos.x}/${flag.pos.y}`);
  const gap = Math.floor(45 / TEAMMAX);
  const allPosSet = new Set(
    Array.from({ length: TEAMMAX }).map((_, index) => `${5}/${index * gap + 4}`),
  );
  allFlagsPos.forEach((pos) => {
    allPosSet.delete(pos);
  });
  const posStr = Array.from(allPosSet)[0];
  if (!posStr) return;
  return posStr.split("/").map((n) => +n);
};

/**
 * 根据旗帜位置计算小队每个爬的位置
 */
const getCreepsPos = (flagPos: RoomPosition) => {
  const x = flagPos.x;
  const y = flagPos.y;
  const poses: [number, number][] = [];
  if (x < 25) {
    poses.push([x, y], [x - 1, y], [x, y + 1], [x - 1, y + 1]);
  } else {
    poses.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
  }
  return poses.map(([x, y]) => new RoomPosition(x, y, flagPos.roomName));
};

/**
 * 获取左上角的爬，小队整体移动以左上角爬为准
 */
const getOriginCreep = (creeps: Creep[]) => {
  let origin = creeps[0];
  let sum = Infinity;
  for (const creep of creeps) {
    const { x, y } = creep.pos;
    if (sum > x + y) {
      sum = x + y;
      origin = creep;
    }
  }
  return origin;
};

/**
 * 小队治疗，治疗血量最少的
 */
const teamHeal = (creeps: Creep[]) => {
  // creeps.forEach((creep) => creep.heal(hurtCreeps[0]));
  const captain = creeps[0];
  if (!captain) return;

  if (captain.pos.x < 10) {
    creeps.forEach((creep) => {
      if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
      } else {
        creep.heal(captain);
      }
    });
  } else {
    // 至少有两个奶captain，剩余一个优先奶其他爬
    creeps[1]?.heal(captain);
    creeps[2]?.heal(captain);
    // const hurtCreeps = creeps.toSorted((a, b) => a.hits - b.hits);
    creeps[3]?.heal(captain);
  }
};

/**
 * 小队攻击，攻击最近的建筑
 */
const teamAttack = (creeps: Creep[]) => {
  if (!creeps.length) return;
  const hostiles = creeps[0].room.find(FIND_HOSTILE_CREEPS);
  const structures = creeps[0].room.find(FIND_HOSTILE_STRUCTURES);
  const targets = [...hostiles, ...structures];
  creeps.forEach((creep) => {
    const poses = targets.map(({ pos }) => pos);
    const targetPos = creep.pos.findClosestByRange(poses);
    if (!targetPos) return;
    const target = targets.find((target) => target.pos.isEqualTo(targetPos));
    if (!target) {
      return;
    }
    if (creep.pos.isNearTo(target.pos)) {
      creep.rangedMassAttack();
    } else {
      creep.rangedAttack(target);
    }
  });
};

/**
 * 小队内交换位置
 */
const changePos = (creeps: Creep[]) => {
  const origin = getOriginCreep(creeps);
  const captain = creeps[0];
  const centerPos = new RoomPosition(25, 25, origin.room.name);
  const closestPos = getClosestPos(
    centerPos,
    creeps.map((creep) => creep.pos),
  );
  if (!closestPos || captain.pos.isEqualTo(closestPos)) return false;

  const creep = creeps.find((c) => c.pos.isEqualTo(closestPos));
  if (!creep) return false;

  creep.move(creep.pos.getDirectionTo(captain.pos));
  captain.move(captain.pos.getDirectionTo(creep.pos));
  return true;
};

/**
 * 自动更新旗帜位置
 */
const updateFlags = (room: Room, flag: Flag) => {
  if (room._updatedFlag || flag.memory._setPosition) return;

  if (!room._freeFlagPoses) {
    // // 非 road、container 之外的建筑不能走
    // const structures = room
    //   .find(FIND_STRUCTURES)
    //   .filter((s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER);
    // // 找建筑周围的空闲位置
    // const freePoses = new Set<string>();
    // structures.forEach((s) => {
    //   for (let x of [s.pos.x - 4, s.pos.x + 3]) {
    //     for (let y = s.pos.y - 4; y <= s.pos.y + 3; y++) {
    //       freePoses.add(`${x}/${y}`);
    //       freePoses.add(`${x}/${y}`);
    //     }
    //   }
    //   for (let y of [s.pos.y - 4, s.pos.y + 3]) {
    //     for (let x = s.pos.x - 3; x <= s.pos.x + 2; x++) {
    //       freePoses.add(`${x}/${y}`);
    //       freePoses.add(`${x}/${y}`);
    //     }
    //   }
    // });
    // structures.forEach((s) => {
    //   freePoses.forEach((str) => {
    //     const [x, y] = str.split("/").map((n) => +n);
    //     const { x: sx, y: sy } = s.pos;
    //     if (x > sx - 4 && x < sx + 3 && y > sy - 4 && y < sy + 3) {
    //       freePoses.delete(str);
    //     }
    //   });
    // });
    room._freeFlagPoses = new Set(["21/20", "28/20"]);
  }

  // 考虑除自己小队之外的爬的阻挡
  const flags = Object.values(Game.flags).filter((f) => f.pos.roomName === room.name && f !== flag);
  const freePoses = room._freeFlagPoses;
  if (freePoses.has(`${flag.pos.x}/${flag.pos.y}`)) return;

  const posStr = Array.from(freePoses).find((posStr) => {
    const [x, y] = posStr.split("/").map((n) => +n);
    if (flags.every((f) => getRange(f.pos.x, f.pos.y, x, y) > 1)) {
      return posStr;
    }
    return;
  });
  if (!posStr) return;
  const [x, y] = posStr.split("/").map((n) => +n);
  flag.memory._setPosition = [x, y, room.name];
  room._updatedFlag = true;

  return true;
};

/**
 * 根据位置获取小队成员体型
 */
const getBody = (index: number) => {
  if (index === 0) {
    return "t40m10";
  } else {
    return "m5h40m5";
  }
};

declare global {
  interface Memory {
    teams: Record<string, TeamMemory>;
  }

  interface Room {
    _freeFlagPoses: Set<string>;
    _updatedFlag?: boolean;
  }

  interface Game {
    _freeFlagPos?: boolean;
  }

  interface FlagMemory {
    _setPosition?: [number, number, string];
    _setCount?: number;
  }
}
