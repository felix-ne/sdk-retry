/**
 * 基于 IndexedDB 的重试队列（适合大数据量场景）
 * 优势：更大的存储容量（通常 50MB+），异步操作不阻塞主线程
 */

import { QueueItem, RequestPayload, RetryQueueOptions } from './retry-queue';

export class RetryQueueIndexedDB {
  private options: Required<RetryQueueOptions>;
  private db: IDBDatabase | null = null;
  private dbName: string;
  private storeName = 'retry_queue';
  private isProcessing = false;
  private currentConcurrent = 0;
  private retryTimer?: number;

  constructor(options: RetryQueueOptions = {}) {
    this.options = {
      maxQueueSize: options.maxQueueSize ?? 100,
      maxRetries: options.maxRetries ?? 5,
      expireTime: options.expireTime ?? 24 * 60 * 60 * 1000,
      retryInterval: options.retryInterval ?? 30 * 1000,
      maxConcurrent: options.maxConcurrent ?? 3,
      storagePrefix: options.storagePrefix ?? 'sdk_retry_',
      debug: options.debug ?? false,
    };

    this.dbName = `${this.options.storagePrefix}db`;
    this.init();
  }

  /**
   * 初始化数据库
   */
  private async init() {
    await this.openDatabase();
    await this.cleanExpiredItems();
    this.registerListeners();
    this.startRetryLoop();
    this.log('RetryQueueIndexedDB initialized');
  }

  /**
   * 打开 IndexedDB 数据库
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        this.log('IndexedDB not available');
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        this.log('Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.log('Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          
          // 创建索引
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          objectStore.createIndex('retryCount', 'retryCount', { unique: false });
          
          this.log('Object store created');
        }
      };
    });
  }

  /**
   * 添加项到队列
   */
  public async enqueue(payload: Omit<RequestPayload, 'timestamp'>): Promise<boolean> {
    if (!this.db) {
      this.log('Database not ready');
      return false;
    }

    try {
      // 检查队列大小
      const count = await this.getQueueSize();
      if (count >= this.options.maxQueueSize) {
        this.log('Queue is full, removing oldest item');
        await this.removeOldest();
      }

      const item: QueueItem = {
        id: this.generateId(),
        payload: {
          ...payload,
          timestamp: Date.now(),
        },
        retryCount: 0,
        lastRetryTime: 0,
        createdAt: Date.now(),
      };

      await this.addItem(item);
      this.log('Item enqueued', { id: item.id });

      // 立即尝试处理
      this.processQueue();

      return true;
    } catch (error) {
      this.log('Failed to enqueue', error);
      return false;
    }
  }

  /**
   * 添加项到 IndexedDB
   */
  private addItem(item: QueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not ready'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.add(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取队列大小
   */
  private getQueueSize(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not ready'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取所有队列项
   */
  private getAllItems(): Promise<QueueItem[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not ready'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除最旧的项
   */
  private async removeOldest(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    const index = objectStore.index('createdAt');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          resolve();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除指定项
   */
  private deleteItem(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not ready'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 更新项
   */
  private updateItem(item: QueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not ready'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清理过期项
   */
  private async cleanExpiredItems(): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const items = await this.getAllItems();
    let cleaned = 0;

    for (const item of items) {
      const shouldDelete =
        now - item.createdAt > this.options.expireTime ||
        item.retryCount >= this.options.maxRetries;

      if (shouldDelete) {
        await this.deleteItem(item.id);
        cleaned++;
        this.log('Item cleaned', { id: item.id });
      }
    }

    if (cleaned > 0) {
      this.log('Cleaned expired items', { count: cleaned });
    }
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.log('Offline, skipping queue processing');
      return;
    }

    if (!this.db) return;

    this.isProcessing = true;
    this.log('Processing queue');

    try {
      await this.cleanExpiredItems();

      const items = await this.getAllItems();
      const promises: Promise<void>[] = [];

      for (const item of items) {
        if (this.currentConcurrent >= this.options.maxConcurrent) {
          break;
        }

        const timeSinceLastRetry = Date.now() - item.lastRetryTime;
        const minWaitTime = Math.min(
          this.options.retryInterval,
          1000 * Math.pow(2, item.retryCount)
        );

        if (timeSinceLastRetry < minWaitTime) {
          continue;
        }

        this.currentConcurrent++;
        promises.push(this.retryItem(item));
      }

      await Promise.allSettled(promises);
    } finally {
      this.isProcessing = false;
      this.currentConcurrent = 0;
    }
  }

  /**
   * 重试单个项
   */
  private async retryItem(item: QueueItem): Promise<void> {
    this.log('Retrying item', { id: item.id, retryCount: item.retryCount });

    try {
      const { url, method = 'POST', headers, body } = item.payload;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        await this.deleteItem(item.id);
        this.log('Item retry succeeded', { id: item.id });
      } else {
        item.retryCount++;
        item.lastRetryTime = Date.now();

        if (item.retryCount >= this.options.maxRetries) {
          await this.deleteItem(item.id);
          this.log('Item abandoned', { id: item.id });
        } else {
          await this.updateItem(item);
          this.log('Item retry failed', { id: item.id, status: response.status });
        }
      }
    } catch (error) {
      item.retryCount++;
      item.lastRetryTime = Date.now();

      if (item.retryCount >= this.options.maxRetries) {
        await this.deleteItem(item.id);
        this.log('Item abandoned', { id: item.id });
      } else {
        await this.updateItem(item);
        this.log('Item retry error', { id: item.id, error });
      }
    } finally {
      this.currentConcurrent--;
    }
  }

  /**
   * 注册事件监听
   */
  private registerListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.log('Network online, starting retry');
      this.processQueue();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.processQueue();
      }
    });
  }

  /**
   * 启动重试循环
   */
  private startRetryLoop() {
    if (typeof window === 'undefined') return;

    this.retryTimer = window.setInterval(() => {
      this.processQueue();
    }, this.options.retryInterval);
  }

  /**
   * 销毁
   */
  public destroy() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.log('RetryQueueIndexedDB destroyed');
  }

  /**
   * 获取状态
   */
  public async getStatus() {
    if (!this.db) {
      return {
        queueSize: 0,
        isProcessing: this.isProcessing,
        currentConcurrent: this.currentConcurrent,
        items: [],
      };
    }

    const items = await this.getAllItems();

    return {
      queueSize: items.length,
      isProcessing: this.isProcessing,
      currentConcurrent: this.currentConcurrent,
      items: items.map((item) => ({
        id: item.id,
        url: item.payload.url,
        retryCount: item.retryCount,
        age: Date.now() - item.createdAt,
      })),
    };
  }

  /**
   * 手动触发队列处理
   */
  public flush() {
    return this.processQueue();
  }

  /**
   * 清空队列
   */
  public async clear() {
    if (!this.db) return;

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    
    return new Promise<void>((resolve, reject) => {
      const request = objectStore.clear();
      request.onsuccess = () => {
        this.log('Queue cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 日志
   */
  private log(message: string, data?: any) {
    if (this.options.debug) {
      console.log(`[RetryQueueIndexedDB] ${message}`, data || '');
    }
  }
}

