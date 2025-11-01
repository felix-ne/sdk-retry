/**
 * 类型定义
 */

/** 请求优先级 */
export type Priority = 'high' | 'normal' | 'low';

export interface RequestPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timestamp: number;
  /** 请求优先级，默认 normal */
  priority?: Priority;
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

