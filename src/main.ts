import { runRanges } from "./range";
import { runTeams } from "./team";

export const loop = () => {
  runTeams();
  runRanges();

  Object.values(Game.flags).forEach((flag) => {
    if (flag.memory._setPosition) {
      const [x, y, roomName] = flag.memory._setPosition;
      flag.setPosition(new RoomPosition(x, y, roomName));
      if (flag.memory._setCount === 1) {
        delete flag.memory._setPosition;
      } else {
        flag.memory._setCount = 1;
      }
    }
  });

  Object.keys(Memory.creeps).forEach((creepName) => {
    if (!Game.creeps[creepName]) {
      delete Memory.creeps[creepName];
    }
  });

  Object.keys(Memory.flags).forEach((flagName) => {
    if (!Game.flags[flagName]) {
      delete Memory.flags[flagName];
    }
  });
};

Game.clear = () => {
  Memory.teams = {};
  Object.values(Game.creeps).forEach((creep) => creep.suicide());
  Memory.flags = {};
  Object.values(Game.flags).forEach((flag) => flag.remove());
};

declare global {
  interface Game {
    clear(): void;
  }
}
