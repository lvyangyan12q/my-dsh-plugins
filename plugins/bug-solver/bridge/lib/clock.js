/** 可注入时钟：状态机所有时间戳都走 clock.now()，测试用 fake clock 控制。 */
export const systemClock = {
  now: () => Date.now(),
}
