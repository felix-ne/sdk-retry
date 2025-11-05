/**
 * SDK 使用示例
 * 展示如何集成 RetryQueue 到你的 SDK 中
 */

import { RetryQueue } from './index';

export interface SDKOptions {
  apiEndpoint: string;
  apiKey?: string;
  maxRetries?: number;
  enableRetryQueue?: boolean;
  debug?: boolean;
}

export class AnalyticsSDK {
  private options: Required<SDKOptions>;
  private retryQueue: RetryQueue;

  constructor(options: SDKOptions) {
    this.options = {
      apiEndpoint: options.apiEndpoint,
      apiKey: options.apiKey ?? '',
      maxRetries: options.maxRetries ?? 3,
      enableRetryQueue: options.enableRetryQueue ?? true,
      debug: options.debug ?? false,
    };

    // 初始化重试队列
    this.retryQueue = new RetryQueue({
      maxQueueSize: 20, // 最大缓存数量
      maxRetries: 3, // 缓存数据重试次数
      expireTime: 30 * 24 * 60 * 60 * 1000, // 缓存有效期 1个月
      maxConcurrent: 1, // 最大并发数：1
      storagePrefix: '__k_rq_', // 缓存标识前缀
      debug: this.options.debug,
    });

    this.log('SDK initialized');
  }

  /**
   * 上报事件（核心方法）
   */
  async track(
    eventName: string,
    properties?: Record<string, any>,
    priority?: 'high' | 'normal' | 'low'
  ): Promise<void> {
    const payload = {
      event: eventName,
      properties,
      timestamp: Date.now(),
      userId: this.getUserId(),
    };

    await this.sendRequest('/events', payload, priority);
  }

  /**
   * 发送请求（带重试逻辑）
   */
  private async sendRequest(
    path: string,
    data: any,
    priority: 'high' | 'normal' | 'low' = 'normal',
    retryCount = 0
  ): Promise<void> {
    const url = `${this.options.apiEndpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (response.ok) {
        this.log('Request succeeded', { url, data });
        return;
      }

      // 服务器错误
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      // 客户端错误（4xx）不重试
      if (response.status >= 400 && response.status < 500) {
        this.log('Client error, not retrying', { status: response.status });
        return;
      }
    } catch (error) {
      this.log('Request failed', { url, error, retryCount });

      // 达到最大重试次数
      if (retryCount >= this.options.maxRetries) {
        this.log('Max retries reached, adding to queue');

        // 保存到重试队列（带优先级）
        if (this.options.enableRetryQueue) {
          this.retryQueue.enqueue({
            url,
            method: 'POST',
            headers,
            data,
            timestamp: Date.now(),
            priority, // 传递优先级
          });
        }
        return;
      }

      // 指数退避重试
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      await this.sleep(delay);
      return this.sendRequest(path, data, priority, retryCount + 1);
    }
  }

  /**
   * 手动触发队列补发
   */
  public async flushQueue(): Promise<void> {
    await this.retryQueue.flush();
  }

  /**
   * 获取队列状态
   */
  public getQueueStatus() {
    return this.retryQueue.getStatus();
  }

  /**
   * 清空队列
   */
  public clearQueue() {
    this.retryQueue.clear();
  }

  /**
   * 销毁 SDK
   */
  public destroy() {
    this.retryQueue.destroy();
  }

  /**
   * 辅助方法
   */
  private getUserId(): string {
    // 这里可以从 cookie/localStorage 等获取用户ID
    return 'user_12345';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string, data?: any) {
    if (this.options.debug) {
      console.log(`[AnalyticsSDK] ${message}`, data || '');
    }
  }
}

// ============================================
// 使用示例
// ============================================

// 1. 初始化 SDK
const sdk = new AnalyticsSDK({
  apiEndpoint: 'https://api.example.com',
  apiKey: 'your-api-key',
  enableRetryQueue: true,
  debug: true,
});

// 2. 正常使用（失败时会自动重试并加入队列）
sdk.track('page_view', {
  page: '/home',
  referrer: document.referrer,
});

// 3. 使用优先级（重要事件使用 high 优先级）
sdk.track(
  'purchase_completed',
  {
    orderId: '12345',
    amount: 99.99,
  },
  'high'
); // 高优先级，队列满时不会被淘汰

sdk.track(
  'button_click',
  {
    buttonId: 'submit-btn',
    text: 'Submit',
  },
  'normal'
); // 普通优先级（默认）

sdk.track(
  'mouse_move',
  {
    x: 100,
    y: 200,
  },
  'low'
); // 低优先级，队列满时优先淘汰

// 3. 查看队列状态
console.log('Queue status:', sdk.getQueueStatus());

// 4. 手动触发补发（通常不需要，SDK会自动处理）
sdk.flushQueue();

// 5. 页面卸载前确保数据保存
window.addEventListener('beforeunload', () => {
  sdk.destroy();
});
