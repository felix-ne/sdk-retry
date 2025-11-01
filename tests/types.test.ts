/**
 * 类型测试
 * 主要测试类型定义的正确性和类型推断
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { 
  Priority, 
  RequestPayload, 
  QueueItem, 
  RetryQueueOptions,
  QueueStatus 
} from '../src/types';

describe('类型定义测试', () => {
  describe('Priority', () => {
    it('应该只允许三个值', () => {
      expectTypeOf<Priority>().toEqualTypeOf<'high' | 'normal' | 'low'>();
    });
  });

  describe('RequestPayload', () => {
    it('应该包含必需字段', () => {
      const payload: RequestPayload = {
        url: '/api/test',
        timestamp: Date.now(),
      };

      expectTypeOf(payload.url).toBeString();
      expectTypeOf(payload.timestamp).toBeNumber();
    });

    it('应该包含可选字段', () => {
      const payload: RequestPayload = {
        url: '/api/test',
        timestamp: Date.now(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { foo: 'bar' },
        priority: 'high',
      };

      expectTypeOf(payload.method).toEqualTypeOf<string | undefined>();
      expectTypeOf(payload.headers).toEqualTypeOf<Record<string, string> | undefined>();
      expectTypeOf(payload.body).toEqualTypeOf<any | undefined>();
      expectTypeOf(payload.priority).toEqualTypeOf<Priority | undefined>();
    });
  });

  describe('QueueItem', () => {
    it('应该包含所有必需字段', () => {
      const item: QueueItem = {
        id: 'test_id',
        payload: {
          url: '/api/test',
          timestamp: Date.now(),
        },
        priority: 'normal',
        retryCount: 0,
        lastRetryTime: 0,
        createdAt: Date.now(),
      };

      expectTypeOf(item.id).toBeString();
      expectTypeOf(item.payload).toMatchTypeOf<RequestPayload>();
      expectTypeOf(item.priority).toEqualTypeOf<Priority>();
      expectTypeOf(item.retryCount).toBeNumber();
      expectTypeOf(item.lastRetryTime).toBeNumber();
      expectTypeOf(item.createdAt).toBeNumber();
    });
  });

  describe('RetryQueueOptions', () => {
    it('所有字段都应该是可选的', () => {
      const options: RetryQueueOptions = {};
      
      expectTypeOf(options).toMatchTypeOf<{
        maxQueueSize?: number;
        maxRetries?: number;
        expireTime?: number;
        retryInterval?: number;
        maxConcurrent?: number;
        storagePrefix?: string;
        debug?: boolean;
      }>();
    });

    it('应该允许部分配置', () => {
      const options: RetryQueueOptions = {
        maxQueueSize: 100,
        debug: true,
      };

      expectTypeOf(options.maxQueueSize).toEqualTypeOf<number | undefined>();
      expectTypeOf(options.debug).toEqualTypeOf<boolean | undefined>();
    });
  });

  describe('QueueStatus', () => {
    it('应该包含所有状态字段', () => {
      const status: QueueStatus = {
        queueSize: 10,
        isProcessing: false,
        currentConcurrent: 0,
        storageMode: 'localStorage',
        items: [],
      };

      expectTypeOf(status.queueSize).toBeNumber();
      expectTypeOf(status.isProcessing).toBeBoolean();
      expectTypeOf(status.currentConcurrent).toBeNumber();
      expectTypeOf(status.storageMode).toEqualTypeOf<'localStorage' | 'memory'>();
      expectTypeOf(status.items).toBeArray();
    });

    it('items 应该包含正确的字段', () => {
      const status: QueueStatus = {
        queueSize: 1,
        isProcessing: false,
        currentConcurrent: 0,
        storageMode: 'localStorage',
        items: [
          {
            id: 'test',
            url: '/api/test',
            priority: 'high',
            retryCount: 0,
            age: 1000,
          },
        ],
      };

      const item = status.items[0];
      expectTypeOf(item.id).toBeString();
      expectTypeOf(item.url).toBeString();
      expectTypeOf(item.priority).toEqualTypeOf<Priority>();
      expectTypeOf(item.retryCount).toBeNumber();
      expectTypeOf(item.age).toBeNumber();
    });
  });
});



