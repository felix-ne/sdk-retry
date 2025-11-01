# ⚡ 快速开始（5分钟）

## 🎯 核心文件

只需要 `src/` 目录下的这些文件：

```
src/
├── index.ts                # 统一导出
├── types.ts                # 类型定义
├── storage-adapter.ts      # 存储适配器
└── retry-queue.ts          # 核心逻辑
```

## 🚀 使用步骤

### 1. 复制文件

```bash
cp -r src 你的项目/
```

### 2. 导入使用

```typescript
import { RetryQueue } from './src';

// 创建队列
const queue = new RetryQueue({
  maxQueueSize: 100,
  maxRetries: 5,
  debug: true,
});

// 失败时加入队列
async function sendData(url: string, data: any) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed');
  } catch (error) {
    // 加入重试队列
    queue.enqueue({
      url,
      body: data,
      priority: 'normal', // high / normal / low
    });
  }
}
```

### 3. 完成！

队列会自动处理重试、优先级淘汰、跨标签页协调。

## 💡 优先级使用

```typescript
// 高优先级（交易、支付等核心数据）
queue.enqueue({
  url: '/api/purchase',
  body: { orderId: '123' },
  priority: 'high',  // 🔴 队列满时不易被淘汰
});

// 普通优先级（默认）
queue.enqueue({
  url: '/api/click',
  body: { button: 'submit' },
  priority: 'normal', // 🟡 可省略，默认值
});

// 低优先级（鼠标移动等非关键数据）
queue.enqueue({
  url: '/api/mouse',
  body: { x: 100, y: 200 },
  priority: 'low',    // 🟢 队列满时优先淘汰
});
```

## 🎯 完整示例

```typescript
class SDK {
  private queue = new RetryQueue();

  async track(event: string, data: any, priority?: 'high' | 'normal' | 'low') {
    try {
      await fetch('/api/track', {
        method: 'POST',
        body: JSON.stringify({ event, data }),
      });
    } catch (error) {
      // 失败加入队列
      this.queue.enqueue({
        url: '/api/track',
        body: { event, data },
        priority: priority || 'normal',
      });
    }
  }
}

// 使用
const sdk = new SDK();
sdk.track('purchase', { orderId: '123' }, 'high');
sdk.track('click', { button: 'submit' });
```

## 🔧 配置选项

```typescript
new RetryQueue({
  maxQueueSize: 100,           // 队列最大长度
  maxRetries: 5,               // 最大重试次数
  retryInterval: 30000,        // 重试间隔（毫秒）
  expireTime: 86400000,        // 过期时间（24小时）
  debug: true,                 // 开启调试日志
});
```

## 📊 查看状态

```typescript
const status = queue.getStatus();
console.log(status);
// {
//   queueSize: 10,
//   storageMode: 'localStorage',
//   items: [
//     { id: '...', url: '...', priority: 'high', retryCount: 1 }
//   ]
// }
```

## ✨ 自动功能

队列会自动：
- ✅ 每 30 秒定时重试
- ✅ 网络恢复时立即重试
- ✅ 优先级淘汰（保护重要数据）
- ✅ 跨标签页协调（避免重复）
- ✅ 过期清理（24小时后）

## 🧪 测试

```bash
npm install
npm run test:ui    # 可视化测试界面
```

## 📚 更多文档

- **FEATURES.md** - 新功能详细说明
- **README.md** - 完整技术文档
- **ARCHITECTURE.md** - 架构设计

## 💬 完成！

3 步搞定：
1. 复制 `src/`
2. 导入 `RetryQueue`
3. 使用 `enqueue()`

详细功能查看 [FEATURES.md](./FEATURES.md)
