/**
 * 生成指定长度的随机字符串
 * @param length 长度
 */
export const randomStr = (length = 8) => {
  return Math.random().toString(36).slice(-length);
};

/**
 * 从 x，y 坐标获取房间名
 */
export const getRoomNameFromXY = (x: number, y: number) => {
  let we: string, ns: string;
  if (x < 0) {
    we = "W" + (-x - 1);
  } else {
    we = "E" + x;
  }
  if (y < 0) {
    ns = "N" + (-y - 1);
  } else {
    ns = "S" + y;
  }
  return "" + we + ns;
};

/**
 * 从房间名获取 x，y 坐标
 */
export const roomNameToXY = (name: string) => {
  let xx = parseInt(name.substr(1), 10);
  let verticalPos = 2;
  if (xx >= 100) {
    verticalPos = 4;
  } else if (xx >= 10) {
    verticalPos = 3;
  }
  let yy = parseInt(name.substr(verticalPos + 1), 10);
  const horizontalDir = name.charAt(0);
  const verticalDir = name.charAt(verticalPos);
  if (horizontalDir === "W" || horizontalDir === "w") {
    xx = -xx - 1;
  }
  if (verticalDir === "N" || verticalDir === "n") {
    yy = -yy - 1;
  }
  return [xx, yy];
};

/**
 * 目标房间
 */
export const GET_STRONGHOLD_ROOM = function () {
  const roomName = Object.values(Game.rooms).find((r) => r.controller?.my)?.name;
  const [xx, yy] = roomNameToXY(roomName!);
  return getRoomNameFromXY(xx + 1, yy);
};

/**
 * 找到最近的点
 */
export const getClosestPos = (pos: RoomPosition, posList: RoomPosition[]) => {
  let distance = Infinity;
  let result: RoomPosition = posList[0];
  for (const targetPos of posList) {
    const newDistance = (pos.x - targetPos.x) ** 2 + (pos.y - targetPos.y) ** 2;
    if (newDistance < distance) {
      distance = newDistance;
      result = targetPos;
    }
  }
  return result;
};

/**
 * 计算距离
 */
export const getRange = (x1: number, y1: number, x2: number, y2: number) => {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
};
