# SDK 重试队列

一个轻量、强大、可靠的 JS SDK 失败请求重试方案。

## 🚀 快速开始

### 第一步：看演示（1分钟）

```bash
open test-demo.html
```

### 第二步：看文档（5分钟）

**按顺序阅读：**

1. **[START_HERE.md](./START_HERE.md)** ⭐ - 从这里开始！
2. **[FEATURES.md](./FEATURES.md)** - 新功能说明
3. **[QUICKSTART.md](./QUICKSTART.md)** - 5分钟集成

### 第三步：复制使用

```bash
cp -r src 你的项目/
```

```typescript
import { RetryQueue } from './src';

const queue = new RetryQueue();

// 失败时加入队列
queue.enqueue({
  url: '/api/test',
  body: { foo: 'bar' },
  priority: 'high', // high / normal / low
});
```

## ✨ 核心特性

- ✅ **优先级淘汰** - 队列满时保护重要数据
- ✅ **跨标签页锁** - 避免重复上报  
- ✅ **自动降级** - localStorage → 内存
- ✅ **指数退避** - 智能重试策略

## 🧪 测试

```bash
npm install
npm run test:ui    # 可视化测试
```

75+ 测试用例，覆盖率 85%+

## 📚 完整文档

| 文档 | 说明 | 何时看 |
|------|------|--------|
| **START_HERE.md** ⭐ | 学习路径 | 现在！ |
| **FEATURES.md** | 新功能 | 了解优先级和跨标签页锁 |
| **QUICKSTART.md** | 快速集成 | 准备使用时 |
| **TESTING.md** | 测试指南 | 运行测试时 |
| **ARCHITECTURE.md** | 架构设计 | 深入理解时 |
| **SUMMARY.md** | 项目总结 | 了解整体设计时 |

## 🎯 学习路径

```
1. START_HERE.md     （5分钟）
        ↓
2. FEATURES.md       （10分钟）
        ↓
3. QUICKSTART.md     （5分钟）
        ↓
4. 开始使用！
```

## 📦 项目结构

```
sdk_retry/
├── src/                  ⭐ 核心代码（复制这个）
├── tests/                🧪 测试代码
├── START_HERE.md        ⭐ 从这开始
├── FEATURES.md          📖 新功能说明
├── QUICKSTART.md        ⚡ 快速开始
└── test-demo.html       🎮 演示页面
```

## 💬 需要帮助？

1. 先看 [START_HERE.md](./START_HERE.md)
2. 打开 `test-demo.html` 体验
3. 运行 `npm run test:ui` 查看测试

## 📄 许可

MIT License

---

**立即开始：**

```bash
open test-demo.html              # 查看演示
cat START_HERE.md                # 阅读学习路径
cp -r src 你的项目/              # 开始使用
```
