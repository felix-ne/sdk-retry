/**
 * 类型定义
 */

/** 请求优先级 */
export type Priority = 'high' | 'normal' | 'low';

export interface RequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string> | undefined;
  data?: any;
}

export type RequestPayload = RequestOptions & {
  priority: Priority;
  timestamp: number;
  updateSendInfo?: (params: any, data: any) => any;
};

/**
 * 补充上报方式
 */
export enum IAdditionalMethod {
  try_when_pixel_success = 'try_when_pixel_success', // todo：pixel上报成功时进行尝试
  visibilitychange_show = 'visibilitychange_show', // 可见变化
  visibilitychange_hide = 'visibilitychange_hide',
  pagehide = 'pagehide', // 页面离开
  unload = 'unload',
  beforeunload = 'beforeunload',
  nextVisit = 'nextVisit', // 下次访问
  flush = 'flush', // 手动触发
}

export interface QueueItem {
  id: string;
  payload: RequestPayload;
  priority: Priority;
  retryCount: number;
  lastRetryTime: number;
  createdAt: number;
}

export interface RetryQueueOptions {
  /** 最大队列长度 */
  maxQueueSize?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 数据过期时间（毫秒），默认24小时 */
  expireTime?: number;
  /** 重试间隔（毫秒），默认30秒 */
  retryInterval?: number;
  /** 最大并发上报数 */
  maxConcurrent?: number;
  /** 存储key前缀 */
  storagePrefix?: string;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 页面离开前最多上报多少个请求（避免阻塞），默认 1 */
  maxFlushOnUnload?: number;
}

export interface QueueStatus {
  queueSize: number;
  isProcessing: boolean;
  currentConcurrent: number;
  storageMode: 'localStorage' | 'memory';
  items: {
    id: string;
    url: string;
    priority: Priority;
    retryCount: number;
    age: number;
  }[];
}
