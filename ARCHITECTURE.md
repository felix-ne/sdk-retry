# 📐 架构设计文档

## 🎯 设计理念

基于你的实际场景（**成功率 99.9%**），我们采用轻量化设计：

```
localStorage（优先） → 内存（降级）
```

### 为什么不用 IndexedDB？

- ✅ 成功率 99.9% → 失败请求很少
- ✅ localStorage 的 5-10MB 完全够用
- ✅ 代码更简单，维护成本更低
- ✅ 同步 API，性能影响可忽略

### 为什么需要内存降级？

localStorage 可能不可用的场景：
- 🔒 **隐私模式/无痕浏览**
- ⚠️ **用户禁用存储**
- 💾 **存储空间已满**（QuotaExceededError）
- 🚫 **企业安全策略**
- 📱 **某些移动端浏览器限制**

## 📦 模块结构

```
sdk_retry/
├── src/                    # 核心源代码
│   ├── index.ts            # 统一导出（15行）
│   ├── types.ts            # 类型定义（50行）
│   ├── storage-adapter.ts  # 存储适配器（140行）
│   ├── retry-queue.ts      # 核心队列逻辑（320行）
│   └── sdk-example.ts      # 集成示例（200行）
├── backup/                 # 废弃代码（仅供参考）
│   ├── retry-queue-indexeddb.ts
│   └── COMPARISON.md
├── test-demo.html          # 测试演示
└── 文档...
```

### 拆分前 vs 拆分后

| | 拆分前 | 拆分后 |
|---|---|---|
| **文件数** | 1 个（458行） | 3 个核心文件 |
| **单文件大小** | 458行 | 最大 320行 |
| **可读性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **可维护性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **可测试性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🏗️ 模块详解

### 1. types.ts - 类型定义

**职责**：定义所有接口和类型

```typescript
export interface RequestPayload { ... }
export interface QueueItem { ... }
export interface RetryQueueOptions { ... }
export interface QueueStatus { ... }
```

**优点**：
- ✅ 集中管理类型
- ✅ 方便其他模块导入
- ✅ 避免循环依赖

### 2. storage-adapter.ts - 存储适配器

**职责**：统一存储层，自动降级

```typescript
class StorageAdapter {
  load()   // 加载数据
  save()   // 保存数据
  clear()  // 清空数据
  getStorageMode() // 获取当前模式
}
```

**核心特性**：

#### ✅ 自动检测 localStorage 可用性
```typescript
private isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false; // 不可用时返回 false
  }
}
```

#### ✅ 智能降级策略
```
初始化
  ↓
localStorage 可用？
  ├─ Yes → 使用 localStorage
  └─ No  → 降级到内存模式
     ↓
写入失败（QuotaExceededError）？
  └─ Yes → 降级到内存模式
```

#### ✅ 透明切换
```typescript
save(queue: QueueItem[]): boolean {
  if (this.useMemoryFallback) {
    return true; // 内存模式：不需要持久化
  }
  
  try {
    localStorage.setItem(this.storageKey, JSON.stringify(queue));
    return true;
  } catch (error) {
    this.useMemoryFallback = true; // 失败时降级
    return false;
  }
}
```

### 3. retry-queue.ts - 核心队列逻辑

**职责**：队列管理、重试策略、生命周期

```typescript
class RetryQueue {
  enqueue()       // 添加到队列
  processQueue()  // 处理队列
  retryItem()     // 重试单个项
  cleanExpiredItems() // 清理过期项
  getStatus()     // 获取状态
  flush()         // 手动触发
  clear()         // 清空队列
  destroy()       // 销毁队列
}
```

**核心流程**：

```
1. 初始化
   ├─ 创建 StorageAdapter
   ├─ 加载队列数据
   ├─ 清理过期项
   ├─ 注册事件监听
   └─ 启动定时器
   
2. 请求失败 → enqueue()
   ├─ 检查队列是否已满
   ├─ 创建 QueueItem
   ├─ 保存到存储
   └─ 立即尝试处理
   
3. 定时/事件触发 → processQueue()
   ├─ 检查网络状态
   ├─ 清理过期项
   ├─ 并发控制（最多3个）
   ├─ 指数退避检查
   └─ 批量重试
   
4. 重试单个项 → retryItem()
   ├─ 发送请求
   ├─ 成功 → 从队列移除
   ├─ 失败 → 增加重试计数
   └─ 达到上限 → 放弃
```

## 🔄 数据流

```
┌──────────────────────────────────────────────────┐
│                  RetryQueue                      │
│  (核心逻辑：重试策略、队列管理、生命周期)           │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│              StorageAdapter                      │
│  (存储抽象：localStorage + 内存降级)              │
└────────────────┬─────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌──────────┐          ┌──────────┐
│localStorage│        │  Memory  │
│   (优先)   │        │  (降级)  │
└──────────┘          └──────────┘
```

## 🎨 设计模式

### 1. 策略模式（Storage Strategy）

```typescript
// 根据可用性自动选择存储策略
if (localStorage 可用) {
  使用 localStorage;
} else {
  使用 Memory;
}
```

### 2. 适配器模式（Storage Adapter）

```typescript
// 统一的存储接口，隐藏底层实现
class StorageAdapter {
  load() { /* localStorage 或 Memory */ }
  save() { /* localStorage 或 Memory */ }
}
```

### 3. 单例模式（建议使用）

```typescript
// 在 SDK 中通常只需要一个队列实例
class SDK {
  private static retryQueue: RetryQueue;
  
  constructor() {
    if (!SDK.retryQueue) {
      SDK.retryQueue = new RetryQueue();
    }
  }
}
```

## 📊 内存占用分析

### 场景 1: localStorage 模式

```
初始化：~100KB
  ├─ RetryQueue 实例：~10KB
  ├─ StorageAdapter 实例：~5KB
  └─ 队列数据（100项）：~85KB

运行时：~100-200KB
  └─ 随队列大小动态变化
```

### 场景 2: 内存降级模式

```
初始化：~100KB（同上）

运行时：~100-200KB
  └─ 数据仅存在内存中
  └─ 页面刷新后丢失
```

### 对比

| 模式 | 内存占用 | 持久化 | 性能影响 |
|------|---------|-------|---------|
| localStorage | ~100KB | ✅ | 写入 <5ms |
| Memory | ~100KB | ❌ | 写入 <0.1ms |

**结论**：两种模式内存占用几乎相同，区别在于数据是否持久化。

## 🚀 性能优化

### 1. 减少存储写入频率

```typescript
// 批量操作后统一保存
enqueue() {
  this.queue.push(item);
  this.storage.save(this.queue); // 每次都写入
}

// 优化：批量添加
enqueueBatch(items: RequestPayload[]) {
  items.forEach(item => this.queue.push(...));
  this.storage.save(this.queue); // 只写入一次
}
```

### 2. 延迟保存（高级）

```typescript
private saveDebounced = debounce(() => {
  this.storage.save(this.queue);
}, 1000);

enqueue() {
  this.queue.push(item);
  this.saveDebounced(); // 1秒内的多次操作只保存一次
}
```

### 3. 压缩数据（可选）

```typescript
// 如果队列数据很大，可以压缩
import LZString from 'lz-string';

save(queue: QueueItem[]): boolean {
  const compressed = LZString.compress(JSON.stringify(queue));
  localStorage.setItem(this.storageKey, compressed);
}
```

## ⚠️ 边界情况处理

### 1. localStorage 突然不可用

```typescript
// 场景：用户在使用过程中清除浏览器数据
save() {
  try {
    localStorage.setItem(...);
  } catch (error) {
    // 立即降级到内存模式
    this.useMemoryFallback = true;
  }
}
```

### 2. 队列数据损坏

```typescript
// 场景：localStorage 中的数据被篡改
load() {
  try {
    const data = localStorage.getItem(...);
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid data');
    }
    return parsed;
  } catch (error) {
    // 清空损坏的数据，重新开始
    this.clear();
    return [];
  }
}
```

### 3. 跨标签页冲突

**问题**：多个标签页同时操作同一个 localStorage key

**当前方案**：允许冲突（重复上报可接受）

**进阶方案**（可选）：

```typescript
// 使用 BroadcastChannel 协调
const channel = new BroadcastChannel('retry_queue');

channel.onmessage = (event) => {
  if (event.data.type === 'queue_updated') {
    this.queue = this.storage.load(); // 重新加载
  }
};

// 保存后通知其他标签页
save() {
  localStorage.setItem(...);
  channel.postMessage({ type: 'queue_updated' });
}
```

## 🧪 测试建议

### 1. 单元测试（StorageAdapter）

```typescript
describe('StorageAdapter', () => {
  it('should fallback to memory when localStorage is not available', () => {
    // Mock localStorage 不可用
    Object.defineProperty(window, 'localStorage', { value: null });
    
    const adapter = new StorageAdapter('test');
    expect(adapter.getStorageMode()).toBe('memory');
  });
  
  it('should handle QuotaExceededError', () => {
    // Mock localStorage.setItem 抛出错误
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    
    const adapter = new StorageAdapter('test');
    const result = adapter.save([]);
    
    expect(result).toBe(false);
    expect(adapter.getStorageMode()).toBe('memory');
  });
});
```

### 2. 集成测试（RetryQueue）

```typescript
describe('RetryQueue', () => {
  it('should retry failed requests', async () => {
    const queue = new RetryQueue({ debug: false });
    
    // Mock fetch 失败
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    queue.enqueue({ url: 'https://api.example.com', body: {} });
    
    await queue.flush();
    
    const status = queue.getStatus();
    expect(status.queueSize).toBe(1);
    expect(status.items[0].retryCount).toBe(1);
  });
});
```

## 📚 扩展建议

### 1. 添加优先级队列

```typescript
interface QueueItem {
  priority: 'high' | 'normal' | 'low';
  // ...
}

processQueue() {
  // 按优先级排序
  const sorted = this.queue.sort((a, b) => 
    priorityWeight[a.priority] - priorityWeight[b.priority]
  );
}
```

### 2. 添加批量上报

```typescript
async processBatch() {
  const batch = this.queue.slice(0, 10);
  const payloads = batch.map(item => item.payload);
  
  await fetch('/batch', {
    method: 'POST',
    body: JSON.stringify({ items: payloads }),
  });
}
```

### 3. 添加监控指标

```typescript
interface Metrics {
  totalEnqueued: number;
  totalSucceeded: number;
  totalFailed: number;
  averageRetryCount: number;
}

getMetrics(): Metrics { ... }
```

## 📈 总结

### ✅ 优势

1. **轻量化**：不依赖 IndexedDB，代码更简单
2. **健壮性**：自动降级，永不崩溃
3. **可维护**：模块化设计，职责清晰
4. **易测试**：每个模块可独立测试

### 🎯 适用场景

- ✅ 成功率 99%+ 的 SDK
- ✅ 轻量级埋点/监控
- ✅ 对持久化要求不严格的场景
- ✅ 需要快速集成的项目

### 🚫 不适用场景

- ❌ 需要离线优先（大量缓存）
- ❌ 需要复杂查询
- ❌ 对数据持久化要求极高

对于你的场景（成功率 99.9%），这个方案是**完美匹配**！🎯

