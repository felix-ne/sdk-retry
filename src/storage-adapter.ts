/**
 * 存储适配器：localStorage + 内存降级
 */

import { QueueItem } from './types';

export class StorageAdapter {
  private storageKey: string;
  private useMemoryFallback = false;
  private debugMode: boolean;

  constructor(storageKey: string, debug = false) {
    this.storageKey = storageKey;
    this.debugMode = debug;
    
    // 初始化时检测存储可用性
    if (!this.isLocalStorageAvailable()) {
      this.useMemoryFallback = true;
      this.log('localStorage not available, using memory fallback', 'warning');
    }
  }

  /**
   * 检测 localStorage 是否可用
   */
  private isLocalStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 加载队列数据
   */
  load(): QueueItem[] {
    // 内存模式不需要加载
    if (this.useMemoryFallback) {
      return [];
    }

    if (!this.isLocalStorageAvailable()) {
      this.useMemoryFallback = true;
      this.log('localStorage not available, switching to memory mode');
      return [];
    }

    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      this.log('Failed to load from storage, switching to memory fallback', error);
      this.useMemoryFallback = true;
      this.clear();
    }

    return [];
  }

  /**
   * 保存队列数据
   */
  save(queue: QueueItem[]): boolean {
    // 内存模式不需要持久化
    if (this.useMemoryFallback) {
      return true;
    }

    if (!this.isLocalStorageAvailable()) {
      return false;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(queue));
      return true;
    } catch (error) {
      this.log('Failed to save to storage', error);
      
      // QuotaExceededError: 存储已满，降级到内存模式
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.log('Storage quota exceeded, switching to memory fallback', 'warning');
        this.useMemoryFallback = true;
        this.clear();
        return false;
      }
      
      // 其他错误也降级到内存模式
      this.useMemoryFallback = true;
      return false;
    }
  }

  /**
   * 清空存储
   */
  clear(): void {
    if (!this.isLocalStorageAvailable()) {
      return;
    }

    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      this.log('Failed to clear storage', error);
    }
  }

  /**
   * 获取存储模式
   */
  getStorageMode(): 'localStorage' | 'memory' {
    return this.useMemoryFallback ? 'memory' : 'localStorage';
  }

  /**
   * 是否使用内存降级
   */
  isUsingMemoryFallback(): boolean {
    return this.useMemoryFallback;
  }

  /**
   * 日志输出
   */
  private log(message: string, data?: any): void {
    if (this.debugMode) {
      console.log(`[StorageAdapter] ${message}`, data || '');
    }
  }
}

