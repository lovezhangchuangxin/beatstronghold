export const charBodyPartMap = {
  m: MOVE,
  w: WORK,
  a: ATTACK,
  c: CARRY,
  h: HEAL,
  r: RANGED_ATTACK,
  t: TOUGH,
  l: CLAIM,
};

/**
 * 解释字符串部件表达法
 * @param bodyStr
 * @returns 可用于 spawnCreep 的部件身体
 */
export const parseBodyStr = (bodyStr: string): BodyPartConstant[] => {
  let parts: BodyPartConstant[] = [];
  let lastPart: BodyPartConstant;
  let count = 0;

  for (const char of bodyStr + "a") {
    if (char in charBodyPartMap) {
      if (count > 0) {
        parts.push(...Array.from<BodyPartConstant>({ length: count }).fill(lastPart!));
      }
      lastPart = charBodyPartMap[char as keyof typeof charBodyPartMap];
      count = 0;
    } else {
      count = count * 10 + +char;
    }
  }

  return parts;
};
