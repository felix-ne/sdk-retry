/**
 * 接口上报触发时机
 */
export enum ISendBy {
  directly = 'directly', // 立即上报
  retry = 'retry', // 重试上报
  additional = 'additional', // 补充上报
}
