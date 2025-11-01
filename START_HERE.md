# 🚀 从这里开始

欢迎！这是一个简单清晰的学习路径。

## 📚 学习路径（按顺序）

### 1️⃣ 快速体验（5分钟）

```bash
# 打开演示页面
open test-demo.html
```

在页面中尝试：
- 点击 "发送失败请求" 
- 查看队列状态
- 测试优先级和跨标签页功能

### 2️⃣ 了解核心功能（10分钟）

阅读 **[FEATURES.md](./FEATURES.md)** - 只看这两个新功能：

1. **优先级淘汰**：队列满时优先保护重要数据
2. **跨标签页锁**：避免重复上报

### 3️⃣ 快速集成（15分钟）

阅读 **[QUICKSTART.md](./QUICKSTART.md)** - 30秒集成到你的项目

### 4️⃣ 运行测试（理解代码）（可选）

```bash
npm install
npm run test:ui
```

浏览器会打开可视化界面，点击查看每个测试。

### 5️⃣ 深入理解（可选）

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - 架构设计
- **[README.md](./README.md)** - 完整技术文档

---

## 📖 所有文档列表

### ⭐ 必读文档

| 文档 | 用途 | 阅读时间 |
|------|------|---------|
| **START_HERE.md** | 本文档，学习路径 | 5 分钟 |
| **FEATURES.md** | 新功能说明（优先级+跨标签页） | 10 分钟 |
| **QUICKSTART.md** | 快速集成指南 | 15 分钟 |

### 📚 参考文档

| 文档 | 用途 | 何时看 |
|------|------|--------|
| **README.md** | 完整技术文档 | 需要详细了解时 |
| **ARCHITECTURE.md** | 架构设计说明 | 深入理解时 |
| **TESTING.md** | 测试使用指南 | 需要写测试时 |
| **SUMMARY.md** | 项目总结 | 了解整体设计时 |
| **CHANGELOG.md** | 版本更新记录 | 查看更新历史时 |

### 🗂️ 不需要看的

| 文档 | 说明 |
|------|------|
| **backup/** | 废弃代码（IndexedDB版本），不推荐使用 |

---

## 💡 快速上手（3步）

### 步骤 1: 复制代码

```bash
cp -r src 你的项目/
```

### 步骤 2: 使用

```typescript
import { RetryQueue } from './src';

const queue = new RetryQueue({ debug: true });

// 失败时加入队列
queue.enqueue({
  url: '/api/test',
  body: { foo: 'bar' },
  priority: 'high',  // high / normal / low
});
```

### 步骤 3: 完成！

队列会自动：
- ✅ 定时重试
- ✅ 网络恢复时重试  
- ✅ 优先级淘汰保护重要数据
- ✅ 跨标签页避免重复

---

## 🧪 测试

```bash
# 安装依赖
npm install

# 可视化测试界面（推荐）
npm run test:ui

# 或命令行模式
npm test
```

---

## ❓ 常见问题

**Q: 测试失败怎么办？**

A: 确保已安装依赖：
```bash
npm install
npm run test:run
```

**Q: 文档太多不知道看哪个？**

A: 只看 3 个：
1. FEATURES.md（新功能）
2. QUICKSTART.md（快速开始）  
3. test-demo.html（动手试试）

**Q: 队列数据会丢失吗？**

A: 不会，保存在 localStorage。只有隐私模式或用户禁用存储时会降级到内存。

**Q: 如何选择优先级？**

A: 
- `high` - 交易、支付
- `normal` - 普通埋点（默认）
- `low` - 鼠标移动等

---

## 📊 项目结构

```
sdk_retry/
├── src/                    ⭐ 核心代码（复制这个）
│   ├── types.ts
│   ├── storage-adapter.ts
│   ├── retry-queue.ts
│   └── index.ts
│
├── tests/                  🧪 测试代码
│
├── START_HERE.md          ⭐ 本文件
├── FEATURES.md            ⭐ 新功能说明
├── QUICKSTART.md          ⭐ 快速开始
├── README.md              📖 完整文档
├── ARCHITECTURE.md        📐 架构设计
└── test-demo.html         🎮 演示页面
```

---

## 🎯 推荐学习顺序

```
1. 打开 test-demo.html        （体验功能）
        ↓
2. 阅读 FEATURES.md            （理解新功能）
        ↓
3. 阅读 QUICKSTART.md          （快速集成）
        ↓
4. 复制 src/ 到你的项目        （开始使用）
        ↓
5. 运行 npm run test:ui        （可选，理解代码）
```

---

## ✨ 核心特性

- ✅ **优先级淘汰**：队列满时保护重要数据
- ✅ **跨标签页锁**：避免重复上报
- ✅ **自动降级**：localStorage → 内存
- ✅ **指数退避**：智能重试策略
- ✅ **完整测试**：75+ 测试用例

---

## 🚀 立即开始

```bash
# 1. 查看演示
open test-demo.html

# 2. 阅读新功能
cat FEATURES.md

# 3. 快速集成
cat QUICKSTART.md

# 4. 复制使用
cp -r src 你的项目/
```

需要帮助？先看 [FEATURES.md](./FEATURES.md) 和 [QUICKSTART.md](./QUICKSTART.md)！



