/**
 * SDK 请求重试队列
 * 功能：失败请求本地缓存 + 智能补发
 *
 * 存储策略：localStorage（优先） → 内存（降级）
 * 淘汰策略：优先级（低→高） + 时间（旧→新）
 * 跨标签页：简单锁机制避免重复上报
 * 重试机制：事件驱动（网络恢复、页面可见等），不使用定时器
 */

import {
  QueueItem,
  RequestPayload,
  RetryQueueOptions,
  QueueStatus,
  Priority,
  IAdditionalMethod,
} from './types';
import { StorageAdapter } from './storage-adapter';
import { ISendBy } from './interface';

/** 优先级权重（用于排序） */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 1,
  normal: 2,
  high: 3,
};

export class RetryQueue {
  private options: Required<RetryQueueOptions>;
  private queue: QueueItem[] = [];
  private storage: StorageAdapter;
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null; // 跟踪当前处理的 promise
  private currentConcurrent = 0;
  private tabId: string; // 标签页唯一ID
  private lockKey: string; // 跨标签页锁的key

  constructor(options: RetryQueueOptions = {}) {
    this.options = {
      maxQueueSize: options.maxQueueSize ?? 100,
      maxRetries: options.maxRetries ?? 5,
      expireTime: options.expireTime ?? 24 * 60 * 60 * 1000, // 24小时
      retryInterval: options.retryInterval ?? 30 * 1000, // 30秒
      maxConcurrent: options.maxConcurrent ?? 3,
      storagePrefix: options.storagePrefix ?? 'sdk',
      debug: options.debug ?? false,
      maxFlushOnUnload: options.maxFlushOnUnload ?? 1,
    };

    const storageKey = `${this.options.storagePrefix}::rq`;
    this.storage = new StorageAdapter(storageKey, this.options.debug);

    // // 生成当前标签页唯一ID
    this.tabId = this.generateId();
    this.lockKey = `${this.options.storagePrefix}::rq_lock`;

    this.init();
  }

  /**
   * 初始化
   */
  private init() {
    this.queue = this.storage.load();
    this.cleanExpiredItems();
    // this.registerListeners();

    // 如果有队列数据，立即尝试处理（可能网络已恢复）
    if (this.queue.length > 0) {
      Promise.resolve().then(() => {
        if (!this.isProcessing) {
          this.processQueue(IAdditionalMethod.nextVisit);
        }
      });
    }

    this.log('RetryQueue initialized', {
      queueSize: this.queue.length,
      storageMode: this.storage.getStorageMode(),
    });
  }

  /**
   * 添加失败请求到队列
   */
  public enqueue(payload: RequestPayload): boolean {
    // 检查队列是否已满
    if (this.queue.length >= this.options.maxQueueSize) {
      this.log('Queue is full, removing lowest priority item');
      this.removeLowestPriorityItem();
    }

    const priority = payload.priority ?? 'normal';

    this.log(`before enqueue item`);

    const item: QueueItem = {
      id: this.generateId(),
      payload,
      priority,
      retryCount: 0,
      lastRetryTime: 0,
      createdAt: Date.now(),
    };

    this.queue.push(item);
    this.storage.save(this.queue);
    this.log('Item enqueued', {
      id: item.id,
      priority: item.priority,
      queueSize: this.queue.length,
    });

    return true;
  }

  /**
   * 按优先级淘汰：先删除优先级最低的，再删除时间最旧的
   */
  private removeLowestPriorityItem() {
    if (this.queue.length === 0) {
      return;
    }

    // 按优先级（低→高）和时间（旧→新）排序
    this.queue.sort((a, b) => {
      const priorityDiff =
        PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff; // 优先级低的排前面
      }
      return a.createdAt - b.createdAt; // 时间旧的排前面
    });

    // 移除第一个（优先级最低且最旧的）
    const removed = this.queue.shift();
    if (removed) {
      this.log('Removed lowest priority item', {
        id: removed.id,
        priority: removed.priority,
        age: Date.now() - removed.createdAt,
      });
    }
  }

  /**
   * 处理队列（尝试重新上报）
   */
  private async processQueue(event?: IAdditionalMethod) {
    // 如果正在处理，等待当前处理完成
    if (this.isProcessing && this.processingPromise) {
      this.log('Already processing, waiting for completion');
      return this.processingPromise;
    }

    // 没有网络连接时跳过
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.log('Offline, skipping queue processing');
      return;
    }

    // 队列为空
    if (this.queue.length === 0) {
      this.log('Queue is empty, skipping');
      return;
    }

    // 尝试获取跨标签页锁（先获取锁再设置 isProcessing，避免竞态）
    if (!this.tryAcquireLock()) {
      this.log('Another tab is processing, skipping');
      return;
    }

    // 立即设置处理状态，防止并发
    this.isProcessing = true;
    this.log('Processing queue', {
      queueSize: this.queue.length,
      tabId: this.tabId,
    });

    // 创建并跟踪当前处理的 promise
    this.processingPromise = (async () => {
      try {
        // 清理过期项
        this.cleanExpiredItems();
        let safeCount = 1000; // 安全计数器，防止死循环

        // 循环处理队列，直到队列为空或没有可处理的项
        // 每次最多同时处理 maxConcurrent 个请求
        while (this.queue.length > 0 && safeCount > 0) {
          safeCount--;
          // 并发控制：一次最多处理 maxConcurrent 个
          const promises: Promise<void>[] = [];

          // 创建队列快照，避免在处理过程中队列变化导致的问题
          const queueSnapshot = [...this.queue];

          for (const item of queueSnapshot) {
            // 检查是否已经被移除（可能在之前的处理中被成功移除）
            const stillInQueue = this.queue.find((i) => i.id === item.id);
            if (!stillInQueue) {
              continue;
            }

            // 检查并发限制
            if (this.currentConcurrent >= this.options.maxConcurrent) {
              break;
            }

            // 检查是否应该重试（避免过于频繁）
            // 使用最新数据，而不是快照中的旧数据
            if (stillInQueue.lastRetryTime > 0) {
              const timeSinceLastRetry =
                Date.now() - stillInQueue.lastRetryTime;
              const minWaitTime = Math.min(
                this.options.retryInterval,
                1000 * Math.pow(2, stillInQueue.retryCount) // 指数退避
              );

              if (timeSinceLastRetry < minWaitTime) {
                continue;
              }
            }

            // 开始处理
            this.currentConcurrent++;
            promises.push(this.retryItem(stillInQueue, event));
          }

          // 如果没有可处理的请求，退出循环
          if (promises.length === 0) {
            break;
          }

          // 等待当前批次完成
          await Promise.allSettled(promises);
          this.log('Batch completed', {
            queueSize: this.queue.length,
            processed: promises.length,
          });
        }

        this.log('All items processed', { queueSize: this.queue.length });
      } finally {
        this.isProcessing = false;
        this.currentConcurrent = 0;
        this.storage.save(this.queue); // 保存处理后的状态
        this.releaseLock(); // 释放锁
        this.processingPromise = null; // 清除 promise 跟踪
        this.log('processQueue completed', { queueSize: this.queue.length });
      }
    })();

    // 返回 processingPromise 以便 await
    return this.processingPromise;
  }

  /**
   * 尝试获取跨标签页锁（简单实现）
   * 锁过期时间：10秒（针对移动端优化，通常只有一个激活标签页，足够大多数请求完成）
   */
  private tryAcquireLock(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return true; // 非浏览器环境或内存模式，直接返回 true
    }

    try {
      const lock = localStorage.getItem(this.lockKey);
      const now = Date.now();
      const LOCK_EXPIRE_TIME = 10000; // 10秒（移动端通常只有一个激活标签页，足够完成请求）

      if (lock) {
        const { tabId, timestamp } = JSON.parse(lock);

        // 锁过期或自己持有的锁，可以获取
        if (now - timestamp >= LOCK_EXPIRE_TIME || tabId === this.tabId) {
          // 重新获取锁
          localStorage.setItem(
            this.lockKey,
            JSON.stringify({
              tabId: this.tabId,
              timestamp: now,
            })
          );
          return true;
        }

        // 其他标签页持有未过期的锁
        return false;
      }

      // 获取新锁
      localStorage.setItem(
        this.lockKey,
        JSON.stringify({
          tabId: this.tabId,
          timestamp: now,
        })
      );
      return true;
    } catch {
      return true; // 出错时也返回 true，避免阻塞
    }
  }

  /**
   * 释放跨标签页锁
   */
  private releaseLock() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const lock = localStorage.getItem(this.lockKey);
      if (lock) {
        const { tabId } = JSON.parse(lock);
        // 只释放自己持有的锁
        if (tabId === this.tabId) {
          localStorage.removeItem(this.lockKey);
        }
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 重试单个请求
   */
  private async retryItem(
    item: QueueItem,
    event?: IAdditionalMethod
  ): Promise<void> {
    // 双重检查：确保 item 仍然在队列中（可能已被其他处理移除）
    const currentItem = this.queue.find((i) => i.id === item.id);
    if (!currentItem) {
      this.log('Item already removed, skipping retry', { id: item.id });
      return;
    }

    // 更新 item 的引用为最新的（可能已被 incrementRetryCount 更新）
    const itemToRetry = currentItem;

    this.log('Retrying item', {
      id: itemToRetry.id,
      retryCount: itemToRetry.retryCount,
    });

    try {
      const {
        url,
        method = 'POST',
        headers,
        data,
        timestamp,
        updateSendInfo,
      } = itemToRetry.payload;

      const body = updateSendInfo
        ? updateSendInfo(
            {
              sendBy: ISendBy.additional, // 接口上报触发时机
              emitTime: timestamp,
              sendTime: Date.now(), // 本次接口上报client时间
              additionalMethod: event, // 补充上报方式，非补充上报时为undefined
              sendMethod: 3, // 原外层sendMethod字段，1、XHR；2、BEACON
              sendWithXhrAsync: false, // 原外层sendWithXhrAsync字段，xhr同步 or异步
            },
            data
          )
        : data;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        // 成功：从队列中移除（再次检查确保还在队列中）
        this.removeItem(itemToRetry.id);
        this.log('Item retry succeeded', { id: itemToRetry.id });
      } else {
        // 失败：增加重试计数
        this.incrementRetryCount(itemToRetry.id);
        this.log('Item retry failed', {
          id: itemToRetry.id,
          status: response.status,
          retryCount: itemToRetry.retryCount + 1,
        });
      }
    } catch (error) {
      // 网络错误：增加重试计数（再次检查确保还在队列中）
      const stillInQueue = this.queue.find((i) => i.id === itemToRetry.id);
      if (stillInQueue) {
        this.incrementRetryCount(itemToRetry.id);
      }
      this.log('Item retry error', { id: itemToRetry.id, error });
    } finally {
      // 确保并发计数正确递减
      // 只有在实际尝试了请求后才递减（无论成功失败）
      this.currentConcurrent--;
    }
  }

  /**
   * 清理过期和超过重试次数的数据
   */
  private cleanExpiredItems() {
    const now = Date.now();
    const originalLength = this.queue.length;

    this.queue = this.queue.filter((item) => {
      // 过期检查
      if (now - item.createdAt > this.options.expireTime) {
        this.log('Item expired', { id: item.id });
        return false;
      }

      // 重试次数检查
      if (item.retryCount >= this.options.maxRetries) {
        this.log('Item exceeded max retries', {
          id: item.id,
          retryCount: item.retryCount,
        });
        return false;
      }

      return true;
    });

    if (this.queue.length !== originalLength) {
      this.storage.save(this.queue);
      this.log('Cleaned expired items', {
        removed: originalLength - this.queue.length,
        remaining: this.queue.length,
      });
    }
  }

  /**
   * 从队列中移除项
   */
  private removeItem(id: string) {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      // 立即保存，避免丢失状态
      this.storage.save(this.queue);
    }
  }

  /**
   * 增加重试计数
   */
  private incrementRetryCount(id: string) {
    const item = this.queue.find((item) => item.id === id);
    if (item) {
      item.retryCount++;
      item.lastRetryTime = Date.now();

      // 如果达到最大重试次数，标记为失败
      if (item.retryCount >= this.options.maxRetries) {
        this.removeItem(id);
        this.log('Item abandoned after max retries', {
          id,
          retryCount: item.retryCount,
        });
      } else {
        // 立即保存，避免丢失重试计数
        this.storage.save(this.queue);
      }
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取队列状态
   */
  public getStatus(): QueueStatus {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      currentConcurrent: this.currentConcurrent,
      storageMode: this.storage.getStorageMode(),
      items: this.queue.map((item) => ({
        id: item.id,
        url: item.payload.url,
        priority: item.priority,
        retryCount: item.retryCount,
        age: Date.now() - item.createdAt,
      })),
    };
  }

  /**
   * 页面卸载前的最后一次上报（使用 sendBeacon）
   */
  flushOnUnload(event: IAdditionalMethod): void {
    // 检查 1: sendBeacon API 是否可用
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      this.log('sendBeacon not available, skipping flush on unload');
      return;
    }

    // 检查 2: 队列是否为空
    if (this.queue.length === 0) {
      return;
    }

    // 检查 3: 是否有足够的高优先级请求值得尝试
    const highPriorityCount = this.queue.filter(
      (item) => item.priority === 'high' || item.priority === 'normal'
    ).length;

    if (highPriorityCount === 0) {
      this.log('No high priority items to flush on unload');
      return;
    }

    // 检查 4: 判断是否有足够时间执行
    // beforeunload 事件通常有很短的时间窗口（< 100ms）
    // visibilitychange (hidden) 和 freeze 可能有更长的时间窗口
    // 但为了安全，我们只尝试发送，不等待任何结果

    // 按优先级排序：high -> normal -> low
    const sortedQueue = [...this.queue].sort((a, b) => {
      return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    });

    // 只处理高优先级和 normal 优先级的请求，限制数量
    let attemptedCount = 0;

    for (const item of sortedQueue) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (attemptedCount >= this.options.maxFlushOnUnload!) {
        break;
      }

      // 只发送 high 和 normal 优先级的请求
      // low 优先级的请求留到下次页面访问时处理
      if (item.priority === 'low') {
        continue;
      }

      // 检查是否有 headers（sendBeacon 不支持 headers）
      // 如果有 headers，跳过这个请求（因为无法正确发送）
      if (
        item.payload.headers &&
        Object.keys(item.payload.headers).length > 0
      ) {
        this.log(
          'Skipping item with headers (sendBeacon cannot send headers)',
          {
            id: item.id,
            priority: item.priority,
            headers: Object.keys(item.payload.headers),
          }
        );
        continue;
      }

      // 检查方法（sendBeacon 只支持 POST）
      if (item.payload.method && item.payload.method.toUpperCase() !== 'POST') {
        this.log('Skipping non-POST request (sendBeacon only supports POST)', {
          id: item.id,
          method: item.payload.method,
        });
        continue;
      }

      try {
        const { url, data, timestamp, updateSendInfo } = item.payload;

        const finalData = updateSendInfo
          ? updateSendInfo(
              {
                sendBy: ISendBy.additional, // 接口上报触发时机
                emitTime: timestamp,
                sendTime: Date.now(), // 本次接口上报client时间
                additionalMethod: event, // 补充上报方式，非补充上报时为undefined
                sendMethod: 2, // 原外层sendMethod字段，1、XHR；2、BEACON
                sendWithXhrAsync: false, // 原外层sendWithXhrAsync字段，xhr同步 or异步
              },
              data
            )
          : data || {};
        const blob = new Blob([JSON.stringify(finalData)], {
          type: 'application/json',
        });

        // sendBeacon 发送（同步，不阻塞页面卸载）
        // ⚠️ 重要：返回 true 只表示请求被加入队列，不表示服务器收到了
        const queued = navigator.sendBeacon(url, blob);

        attemptedCount++;

        if (queued) {
          this.log(
            'Item queued via sendBeacon on unload (will remain in queue for retry)',
            {
              id: item.id,
              priority: item.priority,
              url,
              note: 'Queue item NOT removed - will retry if server does not receive it',
            }
          );
        } else {
          this.log(
            'Failed to queue item via sendBeacon (will retry on next page load)',
            {
              id: item.id,
              priority: item.priority,
            }
          );
        }
      } catch (error) {
        this.log(
          'Error sending item via sendBeacon (will retry on next page load)',
          {
            id: item.id,
            error,
          }
        );
      }
    }

    // ⚠️ 关键：不从队列中移除任何 item
    if (attemptedCount > 0) {
      this.log('Flush on unload completed (items remain in queue for safety)', {
        attempted: attemptedCount,
        queueSize: this.queue.length,
        note: 'Items not removed - will retry via normal process on next page load',
      });
    }
  }

  /**
   * 手动触发队列处理
   */
  public flush(event?: IAdditionalMethod) {
    return this.processQueue(event ?? IAdditionalMethod.flush);
  }

  /**
   * 清空队列
   */
  public clear() {
    this.queue = [];
    this.storage.clear();
    this.log('Queue cleared');
  }

  /**
   * 销毁队列
   */
  public destroy() {
    this.releaseLock(); // 释放锁
    this.storage.save(this.queue);
    this.log('RetryQueue destroyed');
  }

  /**
   * 调试日志
   */
  private log(message: string, data?: any) {
    if (this.options.debug) {
      console.log(`[RetryQueue] ${message}`, data || '');
    }
  }
}
